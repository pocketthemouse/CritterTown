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

function viewAnimations() {
  var animations = document.getElementById('animations');
  toggleDisplay(animations);
}
