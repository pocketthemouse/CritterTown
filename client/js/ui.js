let cascadeX = 32;
let cascadeY = 64;

// web components
customElements.define(
  "widget-window",
  class extends HTMLElement {
    constructor() {
      super();
      let template = document.getElementById("widget-window-template");
      let templateContent = template.content;

      let self = this;

      const shadowRoot = this.attachShadow({ mode: "open" });
      shadowRoot.appendChild(templateContent.cloneNode(true));

      var container = shadowRoot.querySelector('#container');
      var handle = shadowRoot.querySelector('#draghandle');

      container.style.left = cascadeX + "px";
      container.style.top = cascadeY + "px";

      cascadeX += 16;
      cascadeY += 8;

      var dx = 0;
      var dy = 0;

      handle.onmousedown = function(event) {
        dx = event.clientX - container.offsetLeft;
        dy = event.clientY - container.offsetTop;

        document.onmousemove = function(event) {
          container.style.left = (event.clientX - dx) + "px";
          container.style.top = (event.clientY - dy) + "px";
        }

        document.onmouseup = function (event) {
          document.onmousemove = null;
          document.onmouseup = null;
        }
      }

      var minimize = shadowRoot.querySelector('#minimize');
      minimize.onmouseup = function(event) {
        self.style.display = "none";
      }
    }
  }
);

function toggleDisplay(element) {
  element.style.display = element.style.display == 'block' ? 'none' : 'block';
}

function viewBuild() {
  var build = document.getElementById('build');
  toggleDisplay(build);
}

function viewCritter() {
  var critter = document.getElementById('critter');
  toggleDisplay(critter);
}

function viewAbout() {
  var about = document.getElementById('about');
  toggleDisplay(about);
}

function viewAnimations() {
  var animations = document.getElementById('animations');
  toggleDisplay(animations);
}

function viewPortraits() {
  var portraits = document.getElementById('portraits');
  toggleDisplay(portraits);
}

function listAnimations(animations) {
  let list = document.getElementById('animation-list')

  list.innerHTML = ''

  Object.keys(animations).sort().forEach((name) => {
    let li = document.createElement("li")

    let queueButton = document.createElement("button")
    queueButton.innerText = 'Play'
    queueButton.addEventListener('click', (event) => {
      sendCmd("MOV",{"animation":name})
    })
    li.append(queueButton)

    let repeatButton = document.createElement("button")
    repeatButton.innerText = 'Repeat'
    repeatButton.addEventListener('click', (event) => {
      let pic = objects[me]?.pic
      if (!pic) { return }
      pic[2] = name

      sendCmd("BAG",{"update":{"id":me, "pic":pic}})
    })
    li.append(repeatButton)

    let span = document.createElement("span")
    span.innerText = name
    li.append(span)
    
    list.append(li)
  })
}

function listPortraits(species) {
  let list = document.getElementById('portrait-list')

  list.innerHTML = ''

  Object.keys(tracker[species].portrait_files).sort().forEach((name) => {
    if (!tracker[species].portrait_files[name]) {
      return
    }

    let li = document.createElement("li")

    let preview = document.createElement("img")
    preview.src = portraitUrl(species, name)
    li.append(preview)

    let span = document.createElement("span")
    span.innerText = name
    li.append(span)
    
    list.append(li)
  })
}
