/**
 *
 */
'use strict';

var gl = null;
const camera = {
  pos:{
    x: 0, y: 10, z:0
  },
  rotation: {
    x: 0,
    y: 0
  }
};

// background color:
var bgColor =[29/255, 135/255, 229/255];

// game stuff
var cards = [];
var numCards = 16; // must be multiple of 2!
var currentTime = 0;
var selection = new Array();
var selectableCards = numCards;
var cardImages = null;

var pickingShader;


// debug:
var showPicking = false; // for debugging

//scene graph nodes
var root = null;
var rootnofloor = null;
var rotateLight;
var rotateNode;

//textures
var renderTargetColorTexture;
var renderTargetDepthTexture;
var floorTexture;
var textureNode;
var c3po; // model node
var textures; // store all textures
var models; // store all models

// global Settings
var globalSettings = function(){};
globalSettings.useAnisotropicFiltering = true;
globalSettings.useMipmapping = true;

//load the required resources using a utility function
loadResources({
  vs: 'shader/texture.vs.glsl',
  fs: 'shader/texture.fs.glsl',
  picking_fs: 'shader/picking.fs.glsl',
  texture_bg: '../textures/trywood.jpg',
  texture_diffuse: '../textures/wood.png',
  texture_diffuse2: '../textures/checkerboard.jpg',
  texture_diffuse3: '../textures/brick.jpg',
  texture_diffuse_aliasing: '../textures/debug_aliasing_512x512.png',
  texture_card: '../textures/card_bg.png',
  model: '../models/C-3PO.obj',
  model2: '../models/teapot.obj',
  json: 'cards.json'
}).then(function (resources /*an object containing our keys with the loaded resources*/) {
  
  if(resources.json){
    cardImages = resources.json.images;
    resources.json.images.forEach(function(img, index) {
      this[index] = resources.json.folder + "/" + img;
    }, cardImages); // use arr as this
  }
  
  init(resources);

  //console.log(resources.json);
  /*
  if(resources.json){
    resources.json.images.forEach( (img,index) => {
      console.log(img);
      console.log(index);
    });
  }*/
  

  render(0);
});

function init(resources) {
  //create a GL context
  gl = createContext();

  gl.enable(gl.DEPTH_TEST);

  //create shader for picking
  pickingShader = new ShaderSGNode(createProgram(gl, resources.vs, resources.picking_fs));


  //create scenegraph
  root = createSceneGraph(gl, resources);

  // add the same scenegraph (children) to the pickingShader
  pickingShader.children = root.children;


  initInteraction(gl.canvas);
  // init and show gui:
  initGUI();
}

function createSceneGraph(gl, resources) {

  textures = {trywood: resources.texture_bg, checkerboard: resources.texture_diffuse2, wood: resources.texture_diffuse, brick: resources.texture_diffuse3, debug: resources.texture_diffuse_aliasing };
  models = {  none: [],
              c3po: [new RenderSGNode(resources.model)],
              teapot: [new TransformationSGNode(glm.transform({scale:[.1,.1,.1], translate:[0,.9,0]}), [new RenderSGNode(resources.model2)])] };
  
  let root = null;

  //create scenegraph
  if(showPicking)
  {
      root = pickingShader;
  }
  else{
      root = new ShaderSGNode(createProgram(gl, resources.vs, resources.fs));
  }

  

  //light debug helper function
  function createLightSphere() {
    let lightMat = new MaterialSGNode( [new RenderSGNode(makeSphere(.2,10,10))] );
    lightMat.emission = [1, 1, 1, 1]; // only set emission so sphere is white
    lightMat.ambient = lightMat.diffuse = lightMat.specular = [0, 0, 0, 1]; // everyting else is black (0)
    return lightMat;
  }

  {
    //initialize light
    let light = new LightSGNode(); //use now framework implementation of light node
    light.ambient = [0.8, 0.8, 0.8, 1];
    light.diffuse = [0.2, 0.2, 0.2, 1];
    light.specular = [.1, .1, .1, 1];
    light.position = [0, 0, 0];

    rotateLight = new TransformationSGNode(mat4.create());
    let translateLight = new TransformationSGNode(glm.translate(0,2,.2)); //translating the light is the same as setting the light position

    rotateLight.append(translateLight);
    translateLight.append(light);
    //translateLight.append(createLightSphere()); //add sphere for debugging: since we use 0,0,0 as our light position the sphere is at the same position as the light source
    root.append(rotateLight);
  }

  {
    //initialize C3PO
    c3po = new MaterialSGNode( //use now framework implementation of material node
      models[Object.keys(models)[0]][0]
    );
    //gold
    c3po.ambient = [0.24725, 0.1995, 0.0745, 1];
    c3po.diffuse = [0.75164, 0.60648, 0.22648, 1];
    c3po.specular = [0.628281, 0.555802, 0.366065, 1];
    c3po.shininess = 4.0;

    rotateNode = new TransformationSGNode(mat4.create(), [
      new TransformationSGNode(glm.transform({ translate: [0,0, 0], rotateX : 0, scale: 0.5 }),  [
        c3po
      ])
    ]);
    root.append(rotateNode);
  }


  /*
  {
    //initialize floor
    textureNode = new TextureSGNode(Object.values(textures)[0], 0, 'u_diffuseTex',
                    new RenderSGNode(makeRect(1,1)));
    let floor = new MaterialSGNode( textureNode  );

    //dark
    floor.ambient = [0.1, 0.1, 0.1, 1];
    floor.diffuse = [0.7, 0.7, 0.7, 1];
    floor.specular = [0.5, 0.5, 0.5, 1];
    floor.shininess = 50.0;

    root.append(new TransformationSGNode(glm.transform({ translate: [0,-0.1,0], rotateX: -90, scale: 1}), [
      floor
    ]));
  }
  // */

  { // create cards
    let liftCardsTransfNode = new TransformationSGNode(glm.transform({ translate: [0,0,0], rotateX: 0, scale: 1}));
    root.append(liftCardsTransfNode);

    let numPairs = numCards / 2;
    let pairids = permuteArray([...range(0,numPairs-1),...range(0,numPairs-1)]);

    // number of cards in x and y (layout)
    let nCardsX = Math.ceil(Math.sqrt(numCards));
    let nCardsY = Math.ceil(numCards / nCardsX);

    let halfCardSize = Math.min( 1/nCardsX, 1/nCardsY );
    let cardSpacing = .01;

    // place cards on a 2x2 square area
    // o--o -1
    // |  |
    // o--o  1
    //-1  1

    // -1+cardSize to 1+cardSize
    // o=======================o
    let possX = linspace( -1+halfCardSize, 1-halfCardSize, nCardsX ); // positions in x
    let possY = linspace( -1+halfCardSize, 1-halfCardSize, nCardsY ); // positions in y

    let irow = -1;
    for (let i = 0; i < numCards; i++) {
      if((i % nCardsX)==0) 
        irow ++;
      let icol = i - irow*nCardsX;
      let card = createCard(liftCardsTransfNode,resources.texture_card,i+1,
        possX[icol],possY[irow], // position of card
        halfCardSize-cardSpacing, halfCardSize-cardSpacing, // size of card
        pairids[i]);
      cards.push(card);
    }
  }
  

  return root;
}

function createCard(sgNode,texture,id,u,v,uSize,vSize,pairid){
    //backside of card
    let textureNode = new TextureSGNode(texture, 0, 'u_diffuseTex',
                    new RenderSGNode(makeRect(uSize,vSize)));
    // init material
    let material = new MaterialSGNode(  );
    //some material settings:
    material.ambient = [0.5, 0.5, 0.5, 1];
    material.diffuse = [0.5, 0.5, 0.5, 1];
    material.specular = [0.8, 0.8, 0.8, 1];
    material.shininess = 5.0;

    // Uniform for picking 
    let idNode = new SetUniformSGNode('u_objectId', id);
    idNode.append(textureNode);
    material.append(idNode);
    

    // frontside of card
    if(cardImages){
        
        loadResources({
          img: cardImages[pairid],
        }).then(function (newresources /*an object containing our keys with the loaded resources*/) {
            let frontNode = new TextureSGNode(newresources.img, 0, 'u_diffuseTex',new RenderSGNode(makeRect(uSize,vSize)));
            let pNode = new TransformationSGNode(glm.transform({ translate: [0,0,-0.01], rotateX: 180, scale: 1}),frontNode);
            idNode.append(pNode);
        });
    }

    let positionTransf = new TransformationSGNode(glm.transform({ translate: [u,0,v], rotateX: -90, scale: 1}));
    let animation = new TransformationSGNode(glm.transform({ translate: [0,0,0], rotateX: 0, scale: 1}), [
      material
    ])
    positionTransf.append(animation);
    sgNode.append( positionTransf );

    return {
      material: material,
      transformation: animation,
      flipped: false,
      id: id,
      pairid: pairid,
      animate: function(timeInMilliseconds){},
      flip: function()
      {
        this.flipped = !this.flipped;
        initTurnAnimation(this,currentTime,1000);
      }
    }
}

function* range(start, end) {
  for (let i = start; i <= end; i++) {
      yield i;
  }
}

function linspace(startValue, stopValue, cardinality) {
  var arr = [];
  var step = (stopValue - startValue) / (cardinality - 1);
  for (var i = 0; i < cardinality; i++) {
    arr.push(startValue + (step * i));
  }
  return arr;
}

function permuteArray( sort )
{
  // first make a copy of the original sort array
  var rsort = sort.slice();

  // then proceed to shuffle the rsort array      
  for(var idx = 0; idx < rsort.length; idx++)
  {
    var swpIdx = idx + Math.floor(Math.random() * (rsort.length - idx));
    // now swap elements at idx and swpIdx
    var tmp = rsort[idx];
    rsort[idx] = rsort[swpIdx];
    rsort[swpIdx] = tmp;
  }
  // here rsort[] will have been randomly shuffled (permuted)
  return rsort;
}

function initTurnAnimation(card,startTime,duration)
{
    card.animate = function(timeInMilliseconds)
    {
      let x = (timeInMilliseconds - startTime)/duration;
      if(x>1){x=1;}
      let o = card.flipped ? 0 : 180;
      card.transformation.matrix = glm.rotateX(x*180+o);
    }
}

function render(timeInMilliseconds,forPicking) {
  checkForWindowResize(gl);
  currentTime = timeInMilliseconds;

  //setup viewport
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(bgColor[0],bgColor[1],bgColor[2], 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  //setup context and camera matrices
  const context = createSGContext(gl);
  let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  // ToDo: compute proper fovY angle, so that nothing gets clipped! 
  context.projectionMatrix = mat4.perspective(mat4.create(), convertDegreeToRadians(15), aspect , 0.01, 100);
  //very primitive camera implementation
  let lookAtMatrix = mat4.lookAt(mat4.create(), [camera.pos.x,camera.pos.y,camera.pos.z], [0,0,0], [0,.1,1]);
  let mouseRotateMatrix = mat4.multiply(mat4.create(),
                          glm.rotateX(camera.rotation.y),
                          glm.rotateY(camera.rotation.x));
  context.viewMatrix = mat4.multiply(mat4.create(), lookAtMatrix, mouseRotateMatrix);

  //update animations
  context.timeInMilliseconds = timeInMilliseconds;

  rotateNode.matrix = glm.rotateY(timeInMilliseconds*-0.01);
  //rotateLight.matrix = glm.rotateY(timeInMilliseconds*0.05);

  cards.forEach(card => {
    card.animate(timeInMilliseconds);
  });

  if(forPicking)
    pickingShader.render(context);
  else
  {
    //render scenegraph
    root.render(context);

    //animate
    requestAnimationFrame(render);
  }
}

//camera control
function initInteraction(canvas) {
  const mouse = {
    pos: { x : 0, y : 0},
    leftButtonDown: false
  };
  function toPos(event) {
    //convert to local coordinates
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: rect.bottom - event.clientY
    };
  }
  canvas.addEventListener('mousedown', function(event) {
    mouse.pos = toPos(event);
    mouse.leftButtonDown = event.button === 0;
    picking(mouse.pos);
  });
  canvas.addEventListener('mousemove', function(event) {
    const pos = toPos(event);
    const delta = { x : mouse.pos.x - pos.x, y: mouse.pos.y - pos.y };
    if (mouse.leftButtonDown) {
      //add the relative movement of the mouse to the rotation variables
  		//camera.rotation.x += delta.x;
  		//camera.rotation.y += delta.y;
    }
    mouse.pos = pos;
  });
  canvas.addEventListener('mouseup', function(event) {
    mouse.pos = toPos(event);
    mouse.leftButtonDown = false;
    
  });
  canvas.addEventListener("touchstart", function (evt) {
      evt.preventDefault();
      console.log("touchstart.");
      var touches = evt.changedTouches;
      mouse.pos = toPos(event);
            
      for (var i = 0; i < touches.length; i++) {
        //console.log("touchstart:" + i + "...");
        //ongoingTouches.push(copyTouch(touches[i]));
        picking( toPos({clientX: touches[i].pageX, clientY: touches[i].pageY}));
        
        //console.log("touchstart:" + i + ".");
      }
  });
  //register globally
  document.addEventListener('keypress', function(event) {
    //https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent
    if (event.code === 'KeyR') {
      camera.rotation.x = 0;
  		camera.rotation.y = 0;
    }
    if (event.code === 'KeyM') {
    //enable/disable mipmapping
    globalSettings.useMipmapping = !globalSettings.useMipmapping;
    //toggleMipmapping( globalSettings.useMipmapping );
    }
    if (event.code === 'KeyA') {
      //enable/disable anisotropic filtering (only visible in combination with mipmapping)
      globalSettings.useAnisotropicFiltering = !globalSettings.useAnisotropicFiltering;
      //toggleAnisotropicFiltering( globalSettings.useAnisotropicFiltering );
    }
  });
}

function picking(pos){
  // picking
  {
    var pixels = new Uint8Array(4);
    render(currentTime,true); // render scene with picking shader
    gl.readPixels(pos.x, pos.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels); // read pixel corresponding to id
    let cardObjectId = pixels[0];

    if(cardObjectId>0)
    {
      cards.forEach(card => {
        if(card.id == cardObjectId && !card.flipped ) {
          selection.push(card);
          card.flip();
          if(selection.length==2){
            if(selection[0].pairid === selection[1].pairid){
              selectableCards -= 2;
              if(selectableCards==0){
                console.log( 'game is over!' );
                setTimeout(function () {
                  cards.forEach(card => {card.flip();});
                }, 1000);
                setTimeout(function () {
                  window.location.reload(false);
                }, 2000);
              }
            } else {
              let c1=selection[0];
              let c2=selection[1];
              setTimeout(function () {
                c1.flip();
                c2.flip();
              }, 1500);
              
            }
            selection = []; // clear
          }
        }
      });
    }
  }
}

function convertDegreeToRadians(degree) {
  return degree * Math.PI / 180
}

function toggleFullScreen() {
  var doc = window.document;
  var docEl = doc.documentElement;

  var requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
  var cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

  if(!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
    requestFullScreen.call(docEl);
  }
  else {
    cancelFullScreen.call(doc);
  }
}


function initGUI(){

  /*
  var gui = new dat.GUI();

  gui.add( globalSettings, 'useMipmapping' ).onChange(function(value){
    toggleMipmapping(value);
  }).listen();
  gui.add( globalSettings, 'useAnisotropicFiltering' ).onChange(function(value){
    toggleAnisotropicFiltering(value);
  }).listen();


  
  let tmpTexture = function(){}; tmpTexture.texture = Object.keys(textures)[0];
  gui.add( tmpTexture, 'texture', Object.keys(textures) ).onChange(function(value){
    textureNode.image = textures[value];
    textureNode.init(gl);
    toggleMipmapping( globalSettings.useMipmapping );
    toggleAnisotropicFiltering( globalSettings.useAnisotropicFiltering );
    //c3po.children = textures[value];
  });

  let tmpModel = function(){}; tmpModel.model = Object.keys(models)[0];
  gui.add( tmpModel, 'model', Object.keys(models) ).onChange(function(value){
    c3po.children = models[value];
  });
  

  gui.closed = true; // close gui to avoid using up too much screen
  */

}
