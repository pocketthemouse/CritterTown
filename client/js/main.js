function portraitUrl(species, name) {
  return `/img/portrait/${species}/${name}.png`
}

function animDataUrl(species) {
  return `/img/sprite/${species}/AnimData.xml`
}

function animUrl(species, name) {
  return `/img/sprite/${species}/${name}-Anim.png`
}

class Camera {
  static scaleMin = 1
  static scaleMax = 8
  
  constructor() {
    this.x = 20;
    this.y = 20;
    this.scale = 1;
  }

  applyTransform(ctx) {
    this.resetTransform(ctx)
    ctx.scale(this.scale, this.scale)
    ctx.translate(
      -(this.x - ctx.canvas.width/2/this.scale),
      -(this.y - ctx.canvas.height/2/this.scale)
    )
  }

  centerOn({x,y}) {
    if ( x != this.x || y != this.y ) {
      worldDirty = true
    }

    this.x = x
    this.y = y
  }

  resetTransform(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  zoomBy(amount) {
    worldDirty = true

    this.scale = Math.min(Math.max(Camera.scaleMin, this.scale + amount), Camera.scaleMax);
  }
}

class Animation {
  constructor(params) {
    const {name, index, frameWidth, frameHeight, durations} = params;
    Object.assign(this, {name, index, frameWidth, frameHeight, durations})
  } 
}

class Critter {
  constructor(data) {
    this.id = data.id
    this.username = data.username
    this.pic = data.pic
    this.species = data.pic[1]
    this.name = data.name
    this.animations = {}
    this.animationImages = {}
    this.stickyAnimation = data.pic[2]
    this.facing = Facing.fromTilemapIndex(data.dir)
    this.frame = 0
    this.currentDuration = 0
    this.x = data.x
    this.y = data.y

    this.animationQueue = []

    this.fetchAnimationData()
  }

  displayX() {
    if ( this.animationQueue[0] == 'Walk' ) {
      return (
        this.x - Facing.VECTORS[this.facing.imageIndex].x * (1-this.animationPercentage()) 
      ) * TILESIZE
    }
    return this.x * TILESIZE
  }

  displayY() {
    if ( this.animationQueue[0] == 'Walk' ) {
      return (
        this.y - Facing.VECTORS[this.facing.imageIndex].y * (1-this.animationPercentage()) 
      ) * TILESIZE
    }
    return this.y * TILESIZE
  }

  animationDuration() {
    return this.currentAnimation().durations.reduce((a,b)=>a+b, 0)
  }

  animationProgress() {
    return this.currentAnimation().durations.slice(0,this.frame).reduce((a,b)=>a+b, 0) + this.currentDuration
  }

  animationPercentage() {
    if (!this.currentAnimation())
      return 1

    return this.animationProgress()/this.animationDuration() 
  }

  fetchAnimationData() {
    fetch(animDataUrl(this.species)).then((data) => {
      const parser = new DOMParser()

      this.parseAnimData(parser.parseFromString(data, "application/xml"))
    })
  }

  idling() {
    return this.animationQueue.length == 0
  }

  queueAnimation(animation) {
    if (this.animationQueue.length == 0 || this.animationQueue[0] == animation) {
      this.currentDuration = 0
      this.frame = 0
    }
    if (this.animationQueue.length < 5 && animation != this.animationQueue[0])
      this.animationQueue.push(animation)
  }

  dequeueAnimation() {
    if (this.animationQueue.length > 0)
      this.animationQueue.shift()
  }

  currentAnimationName() {
    if (this.animationQueue.length == 0)
      return this.stickyAnimation
    else
      return this.animationQueue[0]
  }

  currentAnimation() {
    return this.animations[this.currentAnimationName()]
  }

  draw(ctx, {x, y}) {
    if (this.pic[0] == "pmd") {
      let anim = this.currentAnimation()
      let image = this.animationImages[
        this.currentAnimationName()
      ]
      if (!anim) { return }
    
      ctx.drawImage(
        image,
        this.frame * anim.frameWidth,
        Math.min(
          this.facing.imageIndex * anim.frameHeight,
          image.height - anim.frameHeight
        ),
        anim.frameWidth,
        anim.frameHeight,
        x - anim.frameWidth/2,
        y - anim.frameHeight/2,
        anim.frameWidth,
        anim.frameHeight
      )
    } else {
      let sheet = getSheet(this.pic[0])
  
      let tileX = this.pic[1]
      let tileY = this.pic[2]

      ctx.drawImage(
        sheet,
        tileX * TILESIZE,
        tileY * TILESIZE,
        TILESIZE,
        TILESIZE,
        x - TILESIZE/2,
        y - TILESIZE/2,
        TILESIZE,
        TILESIZE
      )
    }
  }

  moveTo({x, y, facing}) {
    if ((x !== undefined && x != this.x) || (y !== undefined && y != this.y)) {
      this.queueAnimation("Walk")
    }

    this.x = x === undefined ? this.x : x
    this.y = y === undefined ? this.y : y
    this.facing = facing || this.facing
  }

  advanceFrame() {
    let anim = this.currentAnimation()
    if (!anim) { return }

    this.currentDuration += 1
    if ( anim.durations[this.frame] <= this.currentDuration ) {
      if ( anim.durations[this.frame+1] ) {
        this.currentDuration = 0
        this.frame += 1
      } else {
        this.dequeueAnimation()
        this.currentDuration = 0
        this.frame = 0
      }
    }
  }

  parseAnimData(xml) {
    function read(element, attribute){
      let matches = element.getElementsByTagName(attribute)
      if ( matches.length == 0 ) {
        return null;
      }
      return matches[0].innerHTML
    }

    function animToObj(element, copies){
      let copy = read(element, "CopyOf")
      if ( copy ) {
        return copies[copy]
      }
      return {
        name: read(element, "Name"),
        index: read(element, "Index"),
        frameWidth: read(element, "FrameWidth"),
        frameHeight: read(element, "FrameHeight"),
        durations: Array.from(element.getElementsByTagName("Duration")).map(x => parseInt(x.innerHTML))
      }
    }

    // Load non-copy animations
    let durations = xml.getElementsByTagName("Durations")
    for ( let dur of durations ) {
      let anim = dur.parentElement

      let animObj = new Animation(
        animToObj(anim, this.animations)
      )

      this.animations[animObj.name] = animObj
    }

    // load copy animations
    let copies = xml.getElementsByTagName("CopyOf")
    for ( let copy of copies ) {
      let anim = copy.parentElement
      
      let animObj = new Animation(
        animToObj(anim, this.animations)
      )

      this.animations[animObj.name] = animObj
    }

    // load animation images
    Object.keys(this.animations).forEach((name) => {
      let img = new Image()
      img.src = animUrl(this.species, name)
      this.animationImages[name] = img
    })
  }
}

async function fetch(url) {
  return new Promise(function (resolve, reject) {
    let xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        resolve(xhr.response);
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    };
    xhr.send();
  });
}

let objects = {}
let me;

let camera = new Camera()

let world;
let worldCtx;
let worldDirty = true;
let actors;
let actorsCtx;
let chat;

const TILESIZE = 24
const NAMETAGFONTSIZE = 12

function init() {
  world = document.getElementById("world")
  worldCtx = world.getContext("2d", {"alpha": false})
  actors = document.getElementById("actors")
  actorsCtx = actors.getContext("2d")
  chat = document.getElementById("console")

  initInput()

  worldCtx.imageSmoothingEnabled = false;
  worldCtx.webkitImageSmoothingEnabled = false;
  worldCtx.mozImageSmoothingEnabled = false;
  actorsCtx.imageSmoothingEnabled = false;
  actorsCtx.webkitImageSmoothingEnabled = false;
  actorsCtx.mozImageSmoothingEnabled = false;

  resizeCanvas()
  window.addEventListener("resize", (_) => {resizeCanvas()})

  actors.addEventListener('wheel', function (event) {
    event.preventDefault();
    camera.zoomBy(event.deltaY * -0.01)
  }, false)

  connect()

  window.requestAnimationFrame(update)
}

let lastUpdate;
let dtBank = 0;

function update(now) {
  if (lastUpdate === undefined) {
    lastUpdate = now;
  }

  let dt = now - lastUpdate + dtBank
  lastUpdate = now;

  dt = Math.min(dt, 1000/60*4)

  let updated = false
  while ( dt > 1000/60 ) {
    handleInput()
    advanceFrame()
    dt -= 1000/60
    updated = true
  }

  if (updated) {
    draw()
  }

  dtBank = dt;

  window.requestAnimationFrame(update)
}

function redrawWorld() {
  camera.resetTransform(worldCtx)

  worldCtx.fillStyle = "lightblue";
  worldCtx.fillRect(0, 0, world.width, world.height);

  camera.applyTransform(worldCtx)

  if (townmaps?.[here]) {
    townmaps[here].draw(worldCtx)
  }

  worldDirty = false
}

function draw() {
  let character = objects[me]
  if ( !character ) { return }

  camera.resetTransform(actorsCtx)

  actorsCtx.clearRect(0, 0, actors.width, actors.height);

  if (character) {
    camera.centerOn({
      x: character.displayX(),
      y: character.displayY()
    })
  }

  if ( worldDirty ) {
    redrawWorld()
  }

  camera.applyTransform(actorsCtx)

  actorsCtx.textAlign = "center"
  actorsCtx.font = `${NAMETAGFONTSIZE}px sans-serif`

  Object.values(objects)
  .sort((a,b) => a.displayY() > b.displayY())
  .forEach((obj) => {
    obj.draw(
      actorsCtx,
      {
        x: obj.displayX(),
        y: obj.displayY()
      }
    )

    let frameoffset = 16
    if ( obj.currentAnimation() ) {
      frameoffset = obj.currentAnimation().frameHeight/2 
    }

    let tagpos = {
      x: obj.displayX(),
      y: obj.displayY() - frameoffset - NAMETAGFONTSIZE
    }

    actorsCtx.fillStyle = "black"
    actorsCtx.textBaseline = "top"
    actorsCtx.fillText(obj.name, tagpos.x, tagpos.y);
  })
}

function advanceFrame() {
  Object.values(objects).forEach((obj) => {
    obj.advanceFrame()
  })
}

function resizeCanvas() {
  var parent = world.parentNode;
  var r = parent.getBoundingClientRect();
  world.width = r.width;
  world.height = r.height;
  actors.width = r.width;
  actors.height = r.height

  worldDirty = true

  // needs to be reset after resize
  worldCtx.imageSmoothingEnabled = false;
  worldCtx.webkitImageSmoothingEnabled = false;
  worldCtx.mozImageSmoothingEnabled = false;
  actorsCtx.imageSmoothingEnabled = false;
  actorsCtx.webkitImageSmoothingEnabled = false;
  actorsCtx.mozImageSmoothingEnabled = false;
}

function say(text, species = "0000/0001", portrait = "Normal", klass = null) {
  var bottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight<3;

  let element = document.createElement("div");
  element.classList.add("chatMessage");
  if (klass)
    element.classList.add(klass);
  chat.append(element);

  let img = document.createElement("img")
  img.src = portraitUrl(species, portrait);
  img.className = 'portrait';
  img.width = "48"
  img.height = "48"
  element.append(img)

  let textEl = document.createElement("div")
  textEl.className = "chat-text"
  textEl.innerHTML = text;
  element.append(textEl)

  if (bottom)
    chat.scrollTop = chat.scrollHeight;
}
