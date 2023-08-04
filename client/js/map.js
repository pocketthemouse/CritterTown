let townmaps = {}
let here

let iconSheets = {}

function getSheet(sheet) {
  if (!iconSheets[sheet]) {
    if (sheet?.length > 0) {
      iconSheets[sheet] = new Image()
      iconSheets[sheet].src = sheet
    } else {
      if (DefaultIconSheets[sheet]) {
        iconSheets[sheet] = new Image()
        iconSheets[sheet].src = DefaultIconSheets[sheet]
      } else {
        iconSheets[sheet] = new Image()
        sendCmd("IMG", {"id": sheet})
      }
    }
  }

  return iconSheets[sheet]
}

class TownMap {
  constructor({id, name, defaultTile, width, height}) {
    this.width = width;
    this.height = height;
    this.name = name
    this.id = id
    this.defaultTile = defaultTile

    // Initialize the map
    this.tiles = [];
    this.objects = [];

    this.canvas = document.createElement("canvas")
    this.canvas.width = this.width * TILESIZE
    this.canvas.height = this.height * TILESIZE

    this.ctx = this.canvas.getContext("2d")

    this.dirty = true
  }

  getTile({x, y}) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null
    }
    return this.tiles[y]?.[x] || this.defaultTile
  }

  setTile({x, y, tile}) {
    this.tiles[y] = this.tiles[y] || []
    this.tiles[y][x] = tile
    this.dirty = true
  }

  drawTile(ctx, x, y, tile) {
    let pic = Predefined[tile]?.pic || tile?.pic || tile

    let sheet = getSheet(pic[0])
    let tileX = pic[1]
    let tileY = pic[2]

    ctx.drawImage(
      sheet,
      tileX * TILESIZE,
      tileY * TILESIZE,
      TILESIZE,
      TILESIZE,
      x * TILESIZE,
      y * TILESIZE,
      TILESIZE,
      TILESIZE
    )
  }

  render() {
    for( let y = 0; y < this.height; y++ ) {
      for( let x = 0; x < this.width; x++ ) {
        this.drawTile(this.ctx, x, y, this.getTile({x: x, y: y}))
      }
    }

    this.dirty = false
  }

  draw(ctx) {
    if (this.dirty) {
      this.render()
    }

    ctx.drawImage(this.canvas, 0-TILESIZE/2, 0-TILESIZE/2)
  }
}
