let pressed = {}
let held = {}

let consoleInput;
let buildImg;

function initInput() {
  consoleInput = document.getElementById('consoleInput')
  buildImg = document.getElementById('buildImg')

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) {
      pressed[event.keyCode] = true
      held[event.keyCode] = true
    }

    if (event.keyCode == 13) {
      consoleInput.focus()
    }

    if (event.keyCode == 27) {
      consoleInput.blur()
    }
  })

  window.addEventListener('keyup', (event) => {
    held[event.keyCode] = false
  })

  consoleInput.addEventListener('keydown', (event) => {
    if (event.keyCode == 13) {
      doChat(consoleInput.value)
      consoleInput.value = '';
    }
  })

  buildImg.addEventListener('mousedown', (event) => {
    let character = objects[me]
    if (!character) { return }

    let x = Math.floor(event.layerX / TILESIZE)
    let y = Math.floor(event.layerY / TILESIZE)

    let density = x < 12 || x > 23;

    sendCmd("PUT",{"pos":[character.x,character.y],"obj":false,"atom":{"density":density,"pic":[0,x,y]}}) 
  })

  function normalizeSpecies(text) {
    return text.split('/').map(
      (x) => `${x}`.padStart(4, '0')
    ).join('/')
  }

  document.getElementById("critterButton").addEventListener('click', (event) => {
    sendCmd("BAG",{"update":{"id":me, "temp":true, "pic":["pmd", normalizeSpecies(document.getElementById("critterInput").value), "Idle"]}})
  })

  document.getElementById("nameButton").addEventListener('click', (event) => {
    sendCmd("BAG",{"update":{"id":me, "temp":true, "name":document.getElementById("nameInput").value}})
  })
}

function handleInput() {
  if (document.activeElement.tagName != "INPUT") {
    moveCharacter()
  }

  pressed = {}
}

function moveCharacter() {
  let character = objects[me]
  if (!character) { return }
  if (!character.idling()) { return }

  let facing = null

  let n = held[38] || held[87] // up/w
  let s = held[40] || held[83] // down/s
  let w = held[37] || held[65] // left/a
  let e = held[39] || held[68] // right/d

  if ( e && w ) facing = null
  else if ( n && s ) facing = null
  else if ( n && w ) facing = Facing.NW
  else if ( n && e ) facing = Facing.NE
  else if ( s && w ) facing = Facing.SW
  else if ( s && e ) facing = Facing.SE
  else if ( n ) facing = Facing.N
  else if ( s ) facing = Facing.S
  else if ( w ) facing = Facing.W
  else if ( e ) facing = Facing.E

  if (facing) {
    // if shift is held just spin
    if (held[16]) {
      if (Object.keys(pressed).length > 0) {
        if ( facing != character.facing ) {
          let destination = {
            facing: facing
          }

          sendCmd("MOV", {
            dir: destination.facing.tilemapIndex
          })

          character.moveTo(destination)
        }
      }
    } else {
      let destination = {
        x: character.x + Facing.VECTORS[facing.imageIndex].x,
        y: character.y + Facing.VECTORS[facing.imageIndex].y,
        facing: facing
      }

      let map = townmaps[here]

      let destinationTile = map.getTile(destination)

      if ( destinationTile ) {
        if ( destinationTile.density ) {
          // bonk
          destination.x = character.x
          destination.y = character.y
        }

        sendCmd("MOV", {
          from: [character.x, character.y],
          to: [destination.x, destination.y],
          dir: destination.facing.tilemapIndex
        })

        character.moveTo(destination)
      }
    }
  }  
}

function doChat(message) {
  let character = objects[me]
  if (!character) { return }

  let portrait = 'Normal'

  if (message[0] == '!') {
    portrait = message.split(" ")[0].slice(1)
    message = message.split(" ").slice(1).join(" ")
  }

  sendCmd('MSG', {portrait: portrait, text: message})
}
