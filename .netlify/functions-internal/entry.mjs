import * as adapter from '@astrojs/netlify/netlify-functions.js';
import { escape } from 'html-escaper';
/* empty css                                                                                         */import rss from '@astrojs/rss';
import 'mime';
import 'kleur/colors';
import 'string-width';
import 'path-browserify';
import { compile } from 'path-to-regexp';

const ASTRO_VERSION = "1.2.1";
function createDeprecatedFetchContentFn() {
  return () => {
    throw new Error("Deprecated: Astro.fetchContent() has been replaced with Astro.glob().");
  };
}
function createAstroGlobFn() {
  const globHandler = (importMetaGlobResult, globValue) => {
    let allEntries = [...Object.values(importMetaGlobResult)];
    if (allEntries.length === 0) {
      throw new Error(`Astro.glob(${JSON.stringify(globValue())}) - no matches found.`);
    }
    return Promise.all(allEntries.map((fn) => fn()));
  };
  return globHandler;
}
function createAstro(filePathname, _site, projectRootStr) {
  const site = _site ? new URL(_site) : void 0;
  const referenceURL = new URL(filePathname, `http://localhost`);
  const projectRoot = new URL(projectRootStr);
  return {
    site,
    generator: `Astro v${ASTRO_VERSION}`,
    fetchContent: createDeprecatedFetchContentFn(),
    glob: createAstroGlobFn(),
    resolve(...segments) {
      let resolved = segments.reduce((u, segment) => new URL(segment, u), referenceURL).pathname;
      if (resolved.startsWith(projectRoot.pathname)) {
        resolved = "/" + resolved.slice(projectRoot.pathname.length);
      }
      return resolved;
    }
  };
}

const escapeHTML = escape;
class HTMLString extends String {
}
const markHTMLString = (value) => {
  if (value instanceof HTMLString) {
    return value;
  }
  if (typeof value === "string") {
    return new HTMLString(value);
  }
  return value;
};

class Metadata {
  constructor(filePathname, opts) {
    this.modules = opts.modules;
    this.hoisted = opts.hoisted;
    this.hydratedComponents = opts.hydratedComponents;
    this.clientOnlyComponents = opts.clientOnlyComponents;
    this.hydrationDirectives = opts.hydrationDirectives;
    this.mockURL = new URL(filePathname, "http://example.com");
    this.metadataCache = /* @__PURE__ */ new Map();
  }
  resolvePath(specifier) {
    if (specifier.startsWith(".")) {
      const resolved = new URL(specifier, this.mockURL).pathname;
      if (resolved.startsWith("/@fs") && resolved.endsWith(".jsx")) {
        return resolved.slice(0, resolved.length - 4);
      }
      return resolved;
    }
    return specifier;
  }
  getPath(Component) {
    const metadata = this.getComponentMetadata(Component);
    return (metadata == null ? void 0 : metadata.componentUrl) || null;
  }
  getExport(Component) {
    const metadata = this.getComponentMetadata(Component);
    return (metadata == null ? void 0 : metadata.componentExport) || null;
  }
  getComponentMetadata(Component) {
    if (this.metadataCache.has(Component)) {
      return this.metadataCache.get(Component);
    }
    const metadata = this.findComponentMetadata(Component);
    this.metadataCache.set(Component, metadata);
    return metadata;
  }
  findComponentMetadata(Component) {
    const isCustomElement = typeof Component === "string";
    for (const { module, specifier } of this.modules) {
      const id = this.resolvePath(specifier);
      for (const [key, value] of Object.entries(module)) {
        if (isCustomElement) {
          if (key === "tagName" && Component === value) {
            return {
              componentExport: key,
              componentUrl: id
            };
          }
        } else if (Component === value) {
          return {
            componentExport: key,
            componentUrl: id
          };
        }
      }
    }
    return null;
  }
}
function createMetadata(filePathname, options) {
  return new Metadata(filePathname, options);
}

const PROP_TYPE = {
  Value: 0,
  JSON: 1,
  RegExp: 2,
  Date: 3,
  Map: 4,
  Set: 5,
  BigInt: 6,
  URL: 7
};
function serializeArray(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  if (parents.has(value)) {
    throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
  }
  parents.add(value);
  const serialized = value.map((v) => {
    return convertToSerializedForm(v, metadata, parents);
  });
  parents.delete(value);
  return serialized;
}
function serializeObject(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  if (parents.has(value)) {
    throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
  }
  parents.add(value);
  const serialized = Object.fromEntries(
    Object.entries(value).map(([k, v]) => {
      return [k, convertToSerializedForm(v, metadata, parents)];
    })
  );
  parents.delete(value);
  return serialized;
}
function convertToSerializedForm(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  const tag = Object.prototype.toString.call(value);
  switch (tag) {
    case "[object Date]": {
      return [PROP_TYPE.Date, value.toISOString()];
    }
    case "[object RegExp]": {
      return [PROP_TYPE.RegExp, value.source];
    }
    case "[object Map]": {
      return [
        PROP_TYPE.Map,
        JSON.stringify(serializeArray(Array.from(value), metadata, parents))
      ];
    }
    case "[object Set]": {
      return [
        PROP_TYPE.Set,
        JSON.stringify(serializeArray(Array.from(value), metadata, parents))
      ];
    }
    case "[object BigInt]": {
      return [PROP_TYPE.BigInt, value.toString()];
    }
    case "[object URL]": {
      return [PROP_TYPE.URL, value.toString()];
    }
    case "[object Array]": {
      return [PROP_TYPE.JSON, JSON.stringify(serializeArray(value, metadata, parents))];
    }
    default: {
      if (value !== null && typeof value === "object") {
        return [PROP_TYPE.Value, serializeObject(value, metadata, parents)];
      } else {
        return [PROP_TYPE.Value, value];
      }
    }
  }
}
function serializeProps(props, metadata) {
  const serialized = JSON.stringify(serializeObject(props, metadata));
  return serialized;
}

function serializeListValue(value) {
  const hash = {};
  push(value);
  return Object.keys(hash).join(" ");
  function push(item) {
    if (item && typeof item.forEach === "function")
      item.forEach(push);
    else if (item === Object(item))
      Object.keys(item).forEach((name) => {
        if (item[name])
          push(name);
      });
    else {
      item = item === false || item == null ? "" : String(item).trim();
      if (item) {
        item.split(/\s+/).forEach((name) => {
          hash[name] = true;
        });
      }
    }
  }
}

const HydrationDirectivesRaw = ["load", "idle", "media", "visible", "only"];
const HydrationDirectives = new Set(HydrationDirectivesRaw);
const HydrationDirectiveProps = new Set(HydrationDirectivesRaw.map((n) => `client:${n}`));
function extractDirectives(inputProps) {
  let extracted = {
    isPage: false,
    hydration: null,
    props: {}
  };
  for (const [key, value] of Object.entries(inputProps)) {
    if (key.startsWith("server:")) {
      if (key === "server:root") {
        extracted.isPage = true;
      }
    }
    if (key.startsWith("client:")) {
      if (!extracted.hydration) {
        extracted.hydration = {
          directive: "",
          value: "",
          componentUrl: "",
          componentExport: { value: "" }
        };
      }
      switch (key) {
        case "client:component-path": {
          extracted.hydration.componentUrl = value;
          break;
        }
        case "client:component-export": {
          extracted.hydration.componentExport.value = value;
          break;
        }
        case "client:component-hydration": {
          break;
        }
        case "client:display-name": {
          break;
        }
        default: {
          extracted.hydration.directive = key.split(":")[1];
          extracted.hydration.value = value;
          if (!HydrationDirectives.has(extracted.hydration.directive)) {
            throw new Error(
              `Error: invalid hydration directive "${key}". Supported hydration methods: ${Array.from(
                HydrationDirectiveProps
              ).join(", ")}`
            );
          }
          if (extracted.hydration.directive === "media" && typeof extracted.hydration.value !== "string") {
            throw new Error(
              'Error: Media query must be provided for "client:media", similar to client:media="(max-width: 600px)"'
            );
          }
          break;
        }
      }
    } else if (key === "class:list") {
      extracted.props[key.slice(0, -5)] = serializeListValue(value);
    } else {
      extracted.props[key] = value;
    }
  }
  return extracted;
}
async function generateHydrateScript(scriptOptions, metadata) {
  const { renderer, result, astroId, props, attrs } = scriptOptions;
  const { hydrate, componentUrl, componentExport } = metadata;
  if (!componentExport.value) {
    throw new Error(
      `Unable to resolve a valid export for "${metadata.displayName}"! Please open an issue at https://astro.build/issues!`
    );
  }
  const island = {
    children: "",
    props: {
      uid: astroId
    }
  };
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      island.props[key] = value;
    }
  }
  island.props["component-url"] = await result.resolve(decodeURI(componentUrl));
  if (renderer.clientEntrypoint) {
    island.props["component-export"] = componentExport.value;
    island.props["renderer-url"] = await result.resolve(decodeURI(renderer.clientEntrypoint));
    island.props["props"] = escapeHTML(serializeProps(props, metadata));
  }
  island.props["ssr"] = "";
  island.props["client"] = hydrate;
  island.props["before-hydration-url"] = await result.resolve("astro:scripts/before-hydration.js");
  island.props["opts"] = escapeHTML(
    JSON.stringify({
      name: metadata.displayName,
      value: metadata.hydrateArgs || ""
    })
  );
  return island;
}

var idle_prebuilt_default = `(self.Astro=self.Astro||{}).idle=t=>{const e=async()=>{await(await t())()};"requestIdleCallback"in window?window.requestIdleCallback(e):setTimeout(e,200)},window.dispatchEvent(new Event("astro:idle"));`;

var load_prebuilt_default = `(self.Astro=self.Astro||{}).load=a=>{(async()=>await(await a())())()},window.dispatchEvent(new Event("astro:load"));`;

var media_prebuilt_default = `(self.Astro=self.Astro||{}).media=(s,a)=>{const t=async()=>{await(await s())()};if(a.value){const e=matchMedia(a.value);e.matches?t():e.addEventListener("change",t,{once:!0})}},window.dispatchEvent(new Event("astro:media"));`;

var only_prebuilt_default = `(self.Astro=self.Astro||{}).only=t=>{(async()=>await(await t())())()},window.dispatchEvent(new Event("astro:only"));`;

var visible_prebuilt_default = `(self.Astro=self.Astro||{}).visible=(s,c,n)=>{const r=async()=>{await(await s())()};let i=new IntersectionObserver(e=>{for(const t of e)if(!!t.isIntersecting){i.disconnect(),r();break}});for(let e=0;e<n.children.length;e++){const t=n.children[e];i.observe(t)}},window.dispatchEvent(new Event("astro:visible"));`;

var astro_island_prebuilt_default = `var l;{const c={0:t=>t,1:t=>JSON.parse(t,o),2:t=>new RegExp(t),3:t=>new Date(t),4:t=>new Map(JSON.parse(t,o)),5:t=>new Set(JSON.parse(t,o)),6:t=>BigInt(t),7:t=>new URL(t)},o=(t,i)=>{if(t===""||!Array.isArray(i))return i;const[e,n]=i;return e in c?c[e](n):void 0};customElements.get("astro-island")||customElements.define("astro-island",(l=class extends HTMLElement{constructor(){super(...arguments);this.hydrate=()=>{if(!this.hydrator||this.parentElement&&this.parentElement.closest("astro-island[ssr]"))return;const i=this.querySelectorAll("astro-slot"),e={},n=this.querySelectorAll("template[data-astro-template]");for(const s of n){const r=s.closest(this.tagName);!r||!r.isSameNode(this)||(e[s.getAttribute("data-astro-template")||"default"]=s.innerHTML,s.remove())}for(const s of i){const r=s.closest(this.tagName);!r||!r.isSameNode(this)||(e[s.getAttribute("name")||"default"]=s.innerHTML)}const a=this.hasAttribute("props")?JSON.parse(this.getAttribute("props"),o):{};this.hydrator(this)(this.Component,a,e,{client:this.getAttribute("client")}),this.removeAttribute("ssr"),window.removeEventListener("astro:hydrate",this.hydrate),window.dispatchEvent(new CustomEvent("astro:hydrate"))}}connectedCallback(){!this.hasAttribute("await-children")||this.firstChild?this.childrenConnectedCallback():new MutationObserver((i,e)=>{e.disconnect(),this.childrenConnectedCallback()}).observe(this,{childList:!0})}async childrenConnectedCallback(){window.addEventListener("astro:hydrate",this.hydrate),await import(this.getAttribute("before-hydration-url")),this.start()}start(){const i=JSON.parse(this.getAttribute("opts")),e=this.getAttribute("client");if(Astro[e]===void 0){window.addEventListener(\`astro:\${e}\`,()=>this.start(),{once:!0});return}Astro[e](async()=>{const n=this.getAttribute("renderer-url"),[a,{default:s}]=await Promise.all([import(this.getAttribute("component-url")),n?import(n):()=>()=>{}]),r=this.getAttribute("component-export")||"default";if(!r.includes("."))this.Component=a[r];else{this.Component=a;for(const d of r.split("."))this.Component=this.Component[d]}return this.hydrator=s,this.hydrate},i,this)}attributeChangedCallback(){this.hydrator&&this.hydrate()}},l.observedAttributes=["props"],l))}`;

function determineIfNeedsHydrationScript(result) {
  if (result._metadata.hasHydrationScript) {
    return false;
  }
  return result._metadata.hasHydrationScript = true;
}
const hydrationScripts = {
  idle: idle_prebuilt_default,
  load: load_prebuilt_default,
  only: only_prebuilt_default,
  media: media_prebuilt_default,
  visible: visible_prebuilt_default
};
function determinesIfNeedsDirectiveScript(result, directive) {
  if (result._metadata.hasDirectives.has(directive)) {
    return false;
  }
  result._metadata.hasDirectives.add(directive);
  return true;
}
function getDirectiveScriptText(directive) {
  if (!(directive in hydrationScripts)) {
    throw new Error(`Unknown directive: ${directive}`);
  }
  const directiveScriptText = hydrationScripts[directive];
  return directiveScriptText;
}
function getPrescripts(type, directive) {
  switch (type) {
    case "both":
      return `<style>astro-island,astro-slot{display:contents}</style><script>${getDirectiveScriptText(directive) + astro_island_prebuilt_default}<\/script>`;
    case "directive":
      return `<script>${getDirectiveScriptText(directive)}<\/script>`;
  }
  return "";
}

const Fragment = Symbol.for("astro:fragment");
const Renderer = Symbol.for("astro:renderer");
function stringifyChunk(result, chunk) {
  switch (chunk.type) {
    case "directive": {
      const { hydration } = chunk;
      let needsHydrationScript = hydration && determineIfNeedsHydrationScript(result);
      let needsDirectiveScript = hydration && determinesIfNeedsDirectiveScript(result, hydration.directive);
      let prescriptType = needsHydrationScript ? "both" : needsDirectiveScript ? "directive" : null;
      if (prescriptType) {
        let prescripts = getPrescripts(prescriptType, hydration.directive);
        return markHTMLString(prescripts);
      } else {
        return "";
      }
    }
    default: {
      return chunk.toString();
    }
  }
}

function validateComponentProps(props, displayName) {
  var _a;
  if (((_a = {"BASE_URL":"/","MODE":"production","DEV":false,"PROD":true}) == null ? void 0 : _a.DEV) && props != null) {
    for (const prop of Object.keys(props)) {
      if (HydrationDirectiveProps.has(prop)) {
        console.warn(
          `You are attempting to render <${displayName} ${prop} />, but ${displayName} is an Astro component. Astro components do not render in the client and should not have a hydration directive. Please use a framework component for client rendering.`
        );
      }
    }
  }
}
class AstroComponent {
  constructor(htmlParts, expressions) {
    this.htmlParts = htmlParts;
    this.expressions = expressions;
  }
  get [Symbol.toStringTag]() {
    return "AstroComponent";
  }
  async *[Symbol.asyncIterator]() {
    const { htmlParts, expressions } = this;
    for (let i = 0; i < htmlParts.length; i++) {
      const html = htmlParts[i];
      const expression = expressions[i];
      yield markHTMLString(html);
      yield* renderChild(expression);
    }
  }
}
function isAstroComponent(obj) {
  return typeof obj === "object" && Object.prototype.toString.call(obj) === "[object AstroComponent]";
}
function isAstroComponentFactory(obj) {
  return obj == null ? false : !!obj.isAstroComponentFactory;
}
async function* renderAstroComponent(component) {
  for await (const value of component) {
    if (value || value === 0) {
      for await (const chunk of renderChild(value)) {
        switch (chunk.type) {
          case "directive": {
            yield chunk;
            break;
          }
          default: {
            yield markHTMLString(chunk);
            break;
          }
        }
      }
    }
  }
}
async function renderToString(result, componentFactory, props, children) {
  const Component = await componentFactory(result, props, children);
  if (!isAstroComponent(Component)) {
    const response = Component;
    throw response;
  }
  let html = "";
  for await (const chunk of renderAstroComponent(Component)) {
    html += stringifyChunk(result, chunk);
  }
  return html;
}
async function renderToIterable(result, componentFactory, displayName, props, children) {
  validateComponentProps(props, displayName);
  const Component = await componentFactory(result, props, children);
  if (!isAstroComponent(Component)) {
    console.warn(
      `Returning a Response is only supported inside of page components. Consider refactoring this logic into something like a function that can be used in the page.`
    );
    const response = Component;
    throw response;
  }
  return renderAstroComponent(Component);
}
async function renderTemplate(htmlParts, ...expressions) {
  return new AstroComponent(htmlParts, expressions);
}

async function* renderChild(child) {
  child = await child;
  if (child instanceof HTMLString) {
    yield child;
  } else if (Array.isArray(child)) {
    for (const value of child) {
      yield markHTMLString(await renderChild(value));
    }
  } else if (typeof child === "function") {
    yield* renderChild(child());
  } else if (typeof child === "string") {
    yield markHTMLString(escapeHTML(child));
  } else if (!child && child !== 0) ; else if (child instanceof AstroComponent || Object.prototype.toString.call(child) === "[object AstroComponent]") {
    yield* renderAstroComponent(child);
  } else if (typeof child === "object" && Symbol.asyncIterator in child) {
    yield* child;
  } else {
    yield child;
  }
}
async function renderSlot(result, slotted, fallback) {
  if (slotted) {
    let iterator = renderChild(slotted);
    let content = "";
    for await (const chunk of iterator) {
      if (chunk.type === "directive") {
        content += stringifyChunk(result, chunk);
      } else {
        content += chunk;
      }
    }
    return markHTMLString(content);
  }
  return fallback;
}

/**
 * shortdash - https://github.com/bibig/node-shorthash
 *
 * @license
 *
 * (The MIT License)
 *
 * Copyright (c) 2013 Bibig <bibig@me.com>
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */
const dictionary = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY";
const binary = dictionary.length;
function bitwise(str) {
  let hash = 0;
  if (str.length === 0)
    return hash;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash = hash & hash;
  }
  return hash;
}
function shorthash(text) {
  let num;
  let result = "";
  let integer = bitwise(text);
  const sign = integer < 0 ? "Z" : "";
  integer = Math.abs(integer);
  while (integer >= binary) {
    num = integer % binary;
    integer = Math.floor(integer / binary);
    result = dictionary[num] + result;
  }
  if (integer > 0) {
    result = dictionary[integer] + result;
  }
  return sign + result;
}

const voidElementNames = /^(area|base|br|col|command|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)$/i;
const htmlBooleanAttributes = /^(allowfullscreen|async|autofocus|autoplay|controls|default|defer|disabled|disablepictureinpicture|disableremoteplayback|formnovalidate|hidden|loop|nomodule|novalidate|open|playsinline|readonly|required|reversed|scoped|seamless|itemscope)$/i;
const htmlEnumAttributes = /^(contenteditable|draggable|spellcheck|value)$/i;
const svgEnumAttributes = /^(autoReverse|externalResourcesRequired|focusable|preserveAlpha)$/i;
const STATIC_DIRECTIVES = /* @__PURE__ */ new Set(["set:html", "set:text"]);
const toIdent = (k) => k.trim().replace(/(?:(?<!^)\b\w|\s+|[^\w]+)/g, (match, index) => {
  if (/[^\w]|\s/.test(match))
    return "";
  return index === 0 ? match : match.toUpperCase();
});
const toAttributeString = (value, shouldEscape = true) => shouldEscape ? String(value).replace(/&/g, "&#38;").replace(/"/g, "&#34;") : value;
const kebab = (k) => k.toLowerCase() === k ? k : k.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
const toStyleString = (obj) => Object.entries(obj).map(([k, v]) => `${kebab(k)}:${v}`).join(";");
function defineScriptVars(vars) {
  let output = "";
  for (const [key, value] of Object.entries(vars)) {
    output += `let ${toIdent(key)} = ${JSON.stringify(value)};
`;
  }
  return markHTMLString(output);
}
function formatList(values) {
  if (values.length === 1) {
    return values[0];
  }
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}
function addAttribute(value, key, shouldEscape = true) {
  if (value == null) {
    return "";
  }
  if (value === false) {
    if (htmlEnumAttributes.test(key) || svgEnumAttributes.test(key)) {
      return markHTMLString(` ${key}="false"`);
    }
    return "";
  }
  if (STATIC_DIRECTIVES.has(key)) {
    console.warn(`[astro] The "${key}" directive cannot be applied dynamically at runtime. It will not be rendered as an attribute.

Make sure to use the static attribute syntax (\`${key}={value}\`) instead of the dynamic spread syntax (\`{...{ "${key}": value }}\`).`);
    return "";
  }
  if (key === "class:list") {
    const listValue = toAttributeString(serializeListValue(value));
    if (listValue === "") {
      return "";
    }
    return markHTMLString(` ${key.slice(0, -5)}="${listValue}"`);
  }
  if (key === "style" && !(value instanceof HTMLString) && typeof value === "object") {
    return markHTMLString(` ${key}="${toStyleString(value)}"`);
  }
  if (key === "className") {
    return markHTMLString(` class="${toAttributeString(value, shouldEscape)}"`);
  }
  if (value === true && (key.startsWith("data-") || htmlBooleanAttributes.test(key))) {
    return markHTMLString(` ${key}`);
  } else {
    return markHTMLString(` ${key}="${toAttributeString(value, shouldEscape)}"`);
  }
}
function internalSpreadAttributes(values, shouldEscape = true) {
  let output = "";
  for (const [key, value] of Object.entries(values)) {
    output += addAttribute(value, key, shouldEscape);
  }
  return markHTMLString(output);
}
function renderElement$1(name, { props: _props, children = "" }, shouldEscape = true) {
  const { lang: _, "data-astro-id": astroId, "define:vars": defineVars, ...props } = _props;
  if (defineVars) {
    if (name === "style") {
      delete props["is:global"];
      delete props["is:scoped"];
    }
    if (name === "script") {
      delete props.hoist;
      children = defineScriptVars(defineVars) + "\n" + children;
    }
  }
  if ((children == null || children == "") && voidElementNames.test(name)) {
    return `<${name}${internalSpreadAttributes(props, shouldEscape)} />`;
  }
  return `<${name}${internalSpreadAttributes(props, shouldEscape)}>${children}</${name}>`;
}

function componentIsHTMLElement(Component) {
  return typeof HTMLElement !== "undefined" && HTMLElement.isPrototypeOf(Component);
}
async function renderHTMLElement(result, constructor, props, slots) {
  const name = getHTMLElementName(constructor);
  let attrHTML = "";
  for (const attr in props) {
    attrHTML += ` ${attr}="${toAttributeString(await props[attr])}"`;
  }
  return markHTMLString(
    `<${name}${attrHTML}>${await renderSlot(result, slots == null ? void 0 : slots.default)}</${name}>`
  );
}
function getHTMLElementName(constructor) {
  const definedName = customElements.getName(constructor);
  if (definedName)
    return definedName;
  const assignedName = constructor.name.replace(/^HTML|Element$/g, "").replace(/[A-Z]/g, "-$&").toLowerCase().replace(/^-/, "html-");
  return assignedName;
}

const rendererAliases = /* @__PURE__ */ new Map([["solid", "solid-js"]]);
function guessRenderers(componentUrl) {
  const extname = componentUrl == null ? void 0 : componentUrl.split(".").pop();
  switch (extname) {
    case "svelte":
      return ["@astrojs/svelte"];
    case "vue":
      return ["@astrojs/vue"];
    case "jsx":
    case "tsx":
      return ["@astrojs/react", "@astrojs/preact"];
    default:
      return ["@astrojs/react", "@astrojs/preact", "@astrojs/vue", "@astrojs/svelte"];
  }
}
function getComponentType(Component) {
  if (Component === Fragment) {
    return "fragment";
  }
  if (Component && typeof Component === "object" && Component["astro:html"]) {
    return "html";
  }
  if (isAstroComponentFactory(Component)) {
    return "astro-factory";
  }
  return "unknown";
}
async function renderComponent(result, displayName, Component, _props, slots = {}) {
  var _a;
  Component = await Component;
  switch (getComponentType(Component)) {
    case "fragment": {
      const children2 = await renderSlot(result, slots == null ? void 0 : slots.default);
      if (children2 == null) {
        return children2;
      }
      return markHTMLString(children2);
    }
    case "html": {
      const children2 = {};
      if (slots) {
        await Promise.all(
          Object.entries(slots).map(
            ([key, value]) => renderSlot(result, value).then((output) => {
              children2[key] = output;
            })
          )
        );
      }
      const html2 = Component.render({ slots: children2 });
      return markHTMLString(html2);
    }
    case "astro-factory": {
      async function* renderAstroComponentInline() {
        let iterable = await renderToIterable(result, Component, displayName, _props, slots);
        yield* iterable;
      }
      return renderAstroComponentInline();
    }
  }
  if (!Component && !_props["client:only"]) {
    throw new Error(
      `Unable to render ${displayName} because it is ${Component}!
Did you forget to import the component or is it possible there is a typo?`
    );
  }
  const { renderers } = result._metadata;
  const metadata = { displayName };
  const { hydration, isPage, props } = extractDirectives(_props);
  let html = "";
  let attrs = void 0;
  if (hydration) {
    metadata.hydrate = hydration.directive;
    metadata.hydrateArgs = hydration.value;
    metadata.componentExport = hydration.componentExport;
    metadata.componentUrl = hydration.componentUrl;
  }
  const probableRendererNames = guessRenderers(metadata.componentUrl);
  if (Array.isArray(renderers) && renderers.length === 0 && typeof Component !== "string" && !componentIsHTMLElement(Component)) {
    const message = `Unable to render ${metadata.displayName}!

There are no \`integrations\` set in your \`astro.config.mjs\` file.
Did you mean to add ${formatList(probableRendererNames.map((r) => "`" + r + "`"))}?`;
    throw new Error(message);
  }
  const children = {};
  if (slots) {
    await Promise.all(
      Object.entries(slots).map(
        ([key, value]) => renderSlot(result, value).then((output) => {
          children[key] = output;
        })
      )
    );
  }
  let renderer;
  if (metadata.hydrate !== "only") {
    if (Component && Component[Renderer]) {
      const rendererName = Component[Renderer];
      renderer = renderers.find(({ name }) => name === rendererName);
    }
    if (!renderer) {
      let error;
      for (const r of renderers) {
        try {
          if (await r.ssr.check.call({ result }, Component, props, children)) {
            renderer = r;
            break;
          }
        } catch (e) {
          error ?? (error = e);
        }
      }
      if (!renderer && error) {
        throw error;
      }
    }
    if (!renderer && typeof HTMLElement === "function" && componentIsHTMLElement(Component)) {
      const output = renderHTMLElement(result, Component, _props, slots);
      return output;
    }
  } else {
    if (metadata.hydrateArgs) {
      const passedName = metadata.hydrateArgs;
      const rendererName = rendererAliases.has(passedName) ? rendererAliases.get(passedName) : passedName;
      renderer = renderers.find(
        ({ name }) => name === `@astrojs/${rendererName}` || name === rendererName
      );
    }
    if (!renderer && renderers.length === 1) {
      renderer = renderers[0];
    }
    if (!renderer) {
      const extname = (_a = metadata.componentUrl) == null ? void 0 : _a.split(".").pop();
      renderer = renderers.filter(
        ({ name }) => name === `@astrojs/${extname}` || name === extname
      )[0];
    }
  }
  if (!renderer) {
    if (metadata.hydrate === "only") {
      throw new Error(`Unable to render ${metadata.displayName}!

Using the \`client:only\` hydration strategy, Astro needs a hint to use the correct renderer.
Did you mean to pass <${metadata.displayName} client:only="${probableRendererNames.map((r) => r.replace("@astrojs/", "")).join("|")}" />
`);
    } else if (typeof Component !== "string") {
      const matchingRenderers = renderers.filter((r) => probableRendererNames.includes(r.name));
      const plural = renderers.length > 1;
      if (matchingRenderers.length === 0) {
        throw new Error(`Unable to render ${metadata.displayName}!

There ${plural ? "are" : "is"} ${renderers.length} renderer${plural ? "s" : ""} configured in your \`astro.config.mjs\` file,
but ${plural ? "none were" : "it was not"} able to server-side render ${metadata.displayName}.

Did you mean to enable ${formatList(probableRendererNames.map((r) => "`" + r + "`"))}?`);
      } else if (matchingRenderers.length === 1) {
        renderer = matchingRenderers[0];
        ({ html, attrs } = await renderer.ssr.renderToStaticMarkup.call(
          { result },
          Component,
          props,
          children,
          metadata
        ));
      } else {
        throw new Error(`Unable to render ${metadata.displayName}!

This component likely uses ${formatList(probableRendererNames)},
but Astro encountered an error during server-side rendering.

Please ensure that ${metadata.displayName}:
1. Does not unconditionally access browser-specific globals like \`window\` or \`document\`.
   If this is unavoidable, use the \`client:only\` hydration directive.
2. Does not conditionally return \`null\` or \`undefined\` when rendered on the server.

If you're still stuck, please open an issue on GitHub or join us at https://astro.build/chat.`);
      }
    }
  } else {
    if (metadata.hydrate === "only") {
      html = await renderSlot(result, slots == null ? void 0 : slots.fallback);
    } else {
      ({ html, attrs } = await renderer.ssr.renderToStaticMarkup.call(
        { result },
        Component,
        props,
        children,
        metadata
      ));
    }
  }
  if (renderer && !renderer.clientEntrypoint && renderer.name !== "@astrojs/lit" && metadata.hydrate) {
    throw new Error(
      `${metadata.displayName} component has a \`client:${metadata.hydrate}\` directive, but no client entrypoint was provided by ${renderer.name}!`
    );
  }
  if (!html && typeof Component === "string") {
    const childSlots = Object.values(children).join("");
    const iterable = renderAstroComponent(
      await renderTemplate`<${Component}${internalSpreadAttributes(props)}${markHTMLString(
        childSlots === "" && voidElementNames.test(Component) ? `/>` : `>${childSlots}</${Component}>`
      )}`
    );
    html = "";
    for await (const chunk of iterable) {
      html += chunk;
    }
  }
  if (!hydration) {
    if (isPage || (renderer == null ? void 0 : renderer.name) === "astro:jsx") {
      return html;
    }
    return markHTMLString(html.replace(/\<\/?astro-slot\>/g, ""));
  }
  const astroId = shorthash(
    `<!--${metadata.componentExport.value}:${metadata.componentUrl}-->
${html}
${serializeProps(
      props,
      metadata
    )}`
  );
  const island = await generateHydrateScript(
    { renderer, result, astroId, props, attrs },
    metadata
  );
  let unrenderedSlots = [];
  if (html) {
    if (Object.keys(children).length > 0) {
      for (const key of Object.keys(children)) {
        if (!html.includes(key === "default" ? `<astro-slot>` : `<astro-slot name="${key}">`)) {
          unrenderedSlots.push(key);
        }
      }
    }
  } else {
    unrenderedSlots = Object.keys(children);
  }
  const template = unrenderedSlots.length > 0 ? unrenderedSlots.map(
    (key) => `<template data-astro-template${key !== "default" ? `="${key}"` : ""}>${children[key]}</template>`
  ).join("") : "";
  island.children = `${html ?? ""}${template}`;
  if (island.children) {
    island.props["await-children"] = "";
  }
  async function* renderAll() {
    yield { type: "directive", hydration, result };
    yield markHTMLString(renderElement$1("astro-island", island, false));
  }
  return renderAll();
}

const uniqueElements = (item, index, all) => {
  const props = JSON.stringify(item.props);
  const children = item.children;
  return index === all.findIndex((i) => JSON.stringify(i.props) === props && i.children == children);
};
const alreadyHeadRenderedResults = /* @__PURE__ */ new WeakSet();
function renderHead(result) {
  alreadyHeadRenderedResults.add(result);
  const styles = Array.from(result.styles).filter(uniqueElements).map((style) => renderElement$1("style", style));
  result.styles.clear();
  const scripts = Array.from(result.scripts).filter(uniqueElements).map((script, i) => {
    return renderElement$1("script", script, false);
  });
  const links = Array.from(result.links).filter(uniqueElements).map((link) => renderElement$1("link", link, false));
  return markHTMLString(links.join("\n") + styles.join("\n") + scripts.join("\n"));
}
async function* maybeRenderHead(result) {
  if (alreadyHeadRenderedResults.has(result)) {
    return;
  }
  yield renderHead(result);
}

typeof process === "object" && Object.prototype.toString.call(process) === "[object process]";

new TextEncoder();

function createComponent(cb) {
  cb.isAstroComponentFactory = true;
  return cb;
}
function spreadAttributes(values, _name, { class: scopedClassName } = {}) {
  let output = "";
  if (scopedClassName) {
    if (typeof values.class !== "undefined") {
      values.class += ` ${scopedClassName}`;
    } else if (typeof values["class:list"] !== "undefined") {
      values["class:list"] = [values["class:list"], scopedClassName];
    } else {
      values.class = scopedClassName;
    }
  }
  for (const [key, value] of Object.entries(values)) {
    output += addAttribute(value, key, true);
  }
  return markHTMLString(output);
}

const AstroJSX = "astro:jsx";
const Empty = Symbol("empty");
const toSlotName = (str) => str.trim().replace(/[-_]([a-z])/g, (_, w) => w.toUpperCase());
function isVNode(vnode) {
  return vnode && typeof vnode === "object" && vnode[AstroJSX];
}
function transformSlots(vnode) {
  if (typeof vnode.type === "string")
    return vnode;
  const slots = {};
  if (isVNode(vnode.props.children)) {
    const child = vnode.props.children;
    if (!isVNode(child))
      return;
    if (!("slot" in child.props))
      return;
    const name = toSlotName(child.props.slot);
    slots[name] = [child];
    slots[name]["$$slot"] = true;
    delete child.props.slot;
    delete vnode.props.children;
  }
  if (Array.isArray(vnode.props.children)) {
    vnode.props.children = vnode.props.children.map((child) => {
      if (!isVNode(child))
        return child;
      if (!("slot" in child.props))
        return child;
      const name = toSlotName(child.props.slot);
      if (Array.isArray(slots[name])) {
        slots[name].push(child);
      } else {
        slots[name] = [child];
        slots[name]["$$slot"] = true;
      }
      delete child.props.slot;
      return Empty;
    }).filter((v) => v !== Empty);
  }
  Object.assign(vnode.props, slots);
}
function markRawChildren(child) {
  if (typeof child === "string")
    return markHTMLString(child);
  if (Array.isArray(child))
    return child.map((c) => markRawChildren(c));
  return child;
}
function transformSetDirectives(vnode) {
  if (!("set:html" in vnode.props || "set:text" in vnode.props))
    return;
  if ("set:html" in vnode.props) {
    const children = markRawChildren(vnode.props["set:html"]);
    delete vnode.props["set:html"];
    Object.assign(vnode.props, { children });
    return;
  }
  if ("set:text" in vnode.props) {
    const children = vnode.props["set:text"];
    delete vnode.props["set:text"];
    Object.assign(vnode.props, { children });
    return;
  }
}
function createVNode(type, props) {
  const vnode = {
    [AstroJSX]: true,
    type,
    props: props ?? {}
  };
  transformSetDirectives(vnode);
  transformSlots(vnode);
  return vnode;
}

const ClientOnlyPlaceholder = "astro-client-only";
const skipAstroJSXCheck = /* @__PURE__ */ new WeakSet();
let originalConsoleError;
let consoleFilterRefs = 0;
async function renderJSX(result, vnode) {
  switch (true) {
    case vnode instanceof HTMLString:
      if (vnode.toString().trim() === "") {
        return "";
      }
      return vnode;
    case typeof vnode === "string":
      return markHTMLString(escapeHTML(vnode));
    case (!vnode && vnode !== 0):
      return "";
    case Array.isArray(vnode):
      return markHTMLString(
        (await Promise.all(vnode.map((v) => renderJSX(result, v)))).join("")
      );
  }
  if (isVNode(vnode)) {
    switch (true) {
      case vnode.type === Symbol.for("astro:fragment"):
        return renderJSX(result, vnode.props.children);
      case vnode.type.isAstroComponentFactory: {
        let props = {};
        let slots = {};
        for (const [key, value] of Object.entries(vnode.props ?? {})) {
          if (key === "children" || value && typeof value === "object" && value["$$slot"]) {
            slots[key === "children" ? "default" : key] = () => renderJSX(result, value);
          } else {
            props[key] = value;
          }
        }
        return markHTMLString(await renderToString(result, vnode.type, props, slots));
      }
      case (!vnode.type && vnode.type !== 0):
        return "";
      case (typeof vnode.type === "string" && vnode.type !== ClientOnlyPlaceholder):
        return markHTMLString(await renderElement(result, vnode.type, vnode.props ?? {}));
    }
    if (vnode.type) {
      let extractSlots2 = function(child) {
        if (Array.isArray(child)) {
          return child.map((c) => extractSlots2(c));
        }
        if (!isVNode(child)) {
          _slots.default.push(child);
          return;
        }
        if ("slot" in child.props) {
          _slots[child.props.slot] = [..._slots[child.props.slot] ?? [], child];
          delete child.props.slot;
          return;
        }
        _slots.default.push(child);
      };
      if (typeof vnode.type === "function" && vnode.type["astro:renderer"]) {
        skipAstroJSXCheck.add(vnode.type);
      }
      if (typeof vnode.type === "function" && vnode.props["server:root"]) {
        const output2 = await vnode.type(vnode.props ?? {});
        return await renderJSX(result, output2);
      }
      if (typeof vnode.type === "function" && !skipAstroJSXCheck.has(vnode.type)) {
        useConsoleFilter();
        try {
          const output2 = await vnode.type(vnode.props ?? {});
          if (output2 && output2[AstroJSX]) {
            return await renderJSX(result, output2);
          } else if (!output2) {
            return await renderJSX(result, output2);
          }
        } catch (e) {
          skipAstroJSXCheck.add(vnode.type);
        } finally {
          finishUsingConsoleFilter();
        }
      }
      const { children = null, ...props } = vnode.props ?? {};
      const _slots = {
        default: []
      };
      extractSlots2(children);
      for (const [key, value] of Object.entries(props)) {
        if (value["$$slot"]) {
          _slots[key] = value;
          delete props[key];
        }
      }
      const slotPromises = [];
      const slots = {};
      for (const [key, value] of Object.entries(_slots)) {
        slotPromises.push(
          renderJSX(result, value).then((output2) => {
            if (output2.toString().trim().length === 0)
              return;
            slots[key] = () => output2;
          })
        );
      }
      await Promise.all(slotPromises);
      let output;
      if (vnode.type === ClientOnlyPlaceholder && vnode.props["client:only"]) {
        output = await renderComponent(
          result,
          vnode.props["client:display-name"] ?? "",
          null,
          props,
          slots
        );
      } else {
        output = await renderComponent(
          result,
          typeof vnode.type === "function" ? vnode.type.name : vnode.type,
          vnode.type,
          props,
          slots
        );
      }
      if (typeof output !== "string" && Symbol.asyncIterator in output) {
        let body = "";
        for await (const chunk of output) {
          let html = stringifyChunk(result, chunk);
          body += html;
        }
        return markHTMLString(body);
      } else {
        return markHTMLString(output);
      }
    }
  }
  return markHTMLString(`${vnode}`);
}
async function renderElement(result, tag, { children, ...props }) {
  return markHTMLString(
    `<${tag}${spreadAttributes(props)}${markHTMLString(
      (children == null || children == "") && voidElementNames.test(tag) ? `/>` : `>${children == null ? "" : await renderJSX(result, children)}</${tag}>`
    )}`
  );
}
function useConsoleFilter() {
  consoleFilterRefs++;
  if (!originalConsoleError) {
    originalConsoleError = console.error;
    try {
      console.error = filteredConsoleError;
    } catch (error) {
    }
  }
}
function finishUsingConsoleFilter() {
  consoleFilterRefs--;
}
function filteredConsoleError(msg, ...rest) {
  if (consoleFilterRefs > 0 && typeof msg === "string") {
    const isKnownReactHookError = msg.includes("Warning: Invalid hook call.") && msg.includes("https://reactjs.org/link/invalid-hook-call");
    if (isKnownReactHookError)
      return;
  }
}

const slotName = (str) => str.trim().replace(/[-_]([a-z])/g, (_, w) => w.toUpperCase());
async function check(Component, props, { default: children = null, ...slotted } = {}) {
  if (typeof Component !== "function")
    return false;
  const slots = {};
  for (const [key, value] of Object.entries(slotted)) {
    const name = slotName(key);
    slots[name] = value;
  }
  try {
    const result = await Component({ ...props, ...slots, children });
    return result[AstroJSX];
  } catch (e) {
  }
  return false;
}
async function renderToStaticMarkup(Component, props = {}, { default: children = null, ...slotted } = {}) {
  const slots = {};
  for (const [key, value] of Object.entries(slotted)) {
    const name = slotName(key);
    slots[name] = value;
  }
  const { result } = this;
  const html = await renderJSX(result, createVNode(Component, { ...props, ...slots, children }));
  return { html };
}
var server_default = {
  check,
  renderToStaticMarkup
};

const $$metadata$8 = createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/layouts/Layout.astro", { modules: [], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [] });
const $$Astro$9 = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/layouts/Layout.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$Layout = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$9, $$props, $$slots);
  Astro2.self = $$Layout;
  const { title } = Astro2.props;
  return renderTemplate`<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta name="generator"${addAttribute(Astro2.generator, "content")}>
    <title>${title}</title>
  ${renderHead($$result)}</head>
  <body>
    ${renderSlot($$result, $$slots["default"])}
  </body></html>`;
});

const $$file$8 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/layouts/Layout.astro";
const $$url$8 = undefined;

const $$module1$2 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  $$metadata: $$metadata$8,
  default: $$Layout,
  file: $$file$8,
  url: $$url$8
}, Symbol.toStringTag, { value: 'Module' }));

const $$metadata$7 = createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/MainTitle.astro", { modules: [], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [{ type: "inline", value: `
  import anime from 'animejs'

  anime({
    targets: '#title path',
    strokeDashoffset: [anime.setDashoffset, 0],
    easing: 'easeInOutSine',
    duration: 450,
    delay: function (el, i) {
      return i * 150
    },
  })
` }] });
const $$Astro$8 = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/MainTitle.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$MainTitle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$8, $$props, $$slots);
  Astro2.self = $$MainTitle;
  return renderTemplate`${maybeRenderHead($$result)}<svg id="title" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 839.87 270.33"><defs><style>
      .cls-1 {
        fill: none;
        stroke: #fff;
        stroke-width: 3px;
      }
    </style>
  </defs><title>title</title><g id="Capa_2" data-name="Capa 2"><g id="Title"><g id="second-line"><path class="cls-1" d="M3.64,122.28H29.29v105.3H3.64Z"></path><path class="cls-1" d="M105.64,182.13c0-11.4-6.3-17.7-16-17.7s-16,6.3-16,17.7v45.45H47.89v-83.7H73.54V155c5.1-7,14.1-12,25.35-12,19.35,0,32.25,13.2,32.25,35.7v48.9h-25.5Z"></path><path class="cls-1" d="M151.54,165.18h-9.3v-21.3h9.3v-2.4c0-21.9,13.5-32.7,39-31.35v21.75c-9.9-.6-13.35,2.4-13.35,11.25v.75H191v21.3h-13.8v62.4H151.54Z"></path><path class="cls-1" d="M241.08,228.78c-24.59,0-43.19-16.5-43.19-43.05s19.05-43,43.49-43c24.6,0,43.5,16.5,43.5,43S265.68,228.78,241.08,228.78Zm0-22.2c9.15,0,17.7-6.75,17.7-20.85s-8.4-20.85-17.4-20.85c-9.3,0-17.39,6.6-17.39,20.85S231.79,206.58,241.08,206.58Z"></path><path class="cls-1" d="M330.33,142.68c12.3,0,21.3,5.55,25.8,13V143.88h25.65v83.55c0,22.35-12.9,41.4-41.85,41.4-24.9,0-41.1-12.6-43.35-32.55h25.35c1.65,6.3,7.95,10.35,16.8,10.35,9.75,0,17.4-5.1,17.4-19.2V215.58c-4.65,7.35-13.5,13.2-25.8,13.2-20.55,0-36.89-16.8-36.89-43.2S309.78,142.68,330.33,142.68Zm7.5,22.35c-9.6,0-18.3,7.2-18.3,20.55s8.7,20.85,18.3,20.85c9.75,0,18.3-7.35,18.3-20.7S347.58,165,337.83,165Z"></path><path class="cls-1" d="M426,227.58H400.38v-83.7H426v14C431.88,149,441,143,452.28,143v27.15h-7c-12.15,0-19.2,4.2-19.2,18.6Z"></path><path class="cls-1" d="M496.38,142.68c12.45,0,21.3,5.7,25.8,13V143.88h25.65v83.7H522.18V215.73c-4.65,7.35-13.5,13.05-25.95,13.05-20.4,0-36.75-16.8-36.75-43.2S475.83,142.68,496.38,142.68Zm7.5,22.35c-9.6,0-18.3,7.2-18.3,20.55s8.7,20.85,18.3,20.85,18.3-7.35,18.3-20.7S513.63,165,503.88,165Z"></path><path class="cls-1" d="M569,165.18h-9.3v-21.3H569v-2.4c0-21.9,13.5-32.7,39-31.35v21.75c-9.9-.6-13.35,2.4-13.35,11.25v.75h13.8v21.3h-13.8v62.4H569Z"></path><path class="cls-1" d="M652.68,103.08v20l-36.15,15.15v-17.7Zm-30.3,40.8H648v83.7H622.38Z"></path><path class="cls-1" d="M700.38,142.68c12.45,0,21.3,5.7,25.8,13V143.88h25.64v83.7H726.18V215.73c-4.65,7.35-13.5,13.05-25.95,13.05-20.4,0-36.75-16.8-36.75-43.2S679.83,142.68,700.38,142.68Zm7.5,22.35c-9.6,0-18.3,7.2-18.3,20.55s8.7,20.85,18.3,20.85,18.3-7.35,18.3-20.7S717.63,165,707.88,165Z"></path><path class="cls-1" d="M804.47,228.78c-22.34,0-37.34-12.45-38.54-28.65h25.34c.61,5.85,5.85,9.75,12.9,9.75,6.6,0,10.05-3,10.05-6.75,0-13.5-45.59-3.75-45.59-34.5,0-14.25,12.15-25.95,34-25.95,21.6,0,33.6,12,35.25,28.5h-23.7c-.75-5.7-5.1-9.45-12.3-9.45-6,0-9.29,2.4-9.29,6.45,0,13.35,45.29,3.9,45.74,35.1C838.37,217.83,825.47,228.78,804.47,228.78Z"></path>
      </g><g id="first-line"><path class="cls-1" d="M1.5,1.5H50.37V13.83H33.63V64.68H18.24V13.83H1.5Z"></path><path class="cls-1" d="M107.7,64.68H92.31V57.84A18.3,18.3,0,0,1,77.1,65.22c-11.61,0-19.44-8-19.44-21.42V14.46H73V41.73c0,6.84,3.87,10.62,9.63,10.62,5.94,0,9.72-3.78,9.72-10.62V14.46H107.7Z"></path><path class="cls-1" d="M139.2,65.4c-13.41,0-22.41-7.47-23.13-17.19h15.21c.36,3.51,3.51,5.85,7.74,5.85,4,0,6-1.8,6-4.05,0-8.1-27.36-2.25-27.36-20.7,0-8.55,7.29-15.57,20.43-15.57,13,0,20.16,7.2,21.15,17.1H145.05c-.45-3.42-3.06-5.67-7.38-5.67-3.6,0-5.58,1.44-5.58,3.87,0,8,27.18,2.34,27.45,21.06C159.54,58.83,151.8,65.4,139.2,65.4Z"></path>
      </g>
    </g>
  </g>
</svg>

`;
});

const $$file$7 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/MainTitle.astro";
const $$url$7 = undefined;

const $$module2 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  $$metadata: $$metadata$7,
  default: $$MainTitle,
  file: $$file$7,
  url: $$url$7
}, Symbol.toStringTag, { value: 'Module' }));

const $$metadata$6 = createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/MainImage.astro", { modules: [], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [{ type: "inline", value: `
  import anime from 'animejs'

  const offset = 1000
  const durationAnim = 1500
  const easingAnim = 'cubicBezier(1.000, 0.005, 0.310, 1.000)'

  const items = document.getElementsByClassName('item-anim')
  const mainItems = document.getElementsByClassName('main-item')
  const mainPos = mainItems[0].getBoundingClientRect()

  anime({
    targets: mainItems,
    translateX: [offset, 0],
    translateY: [offset, 0],
    duration: durationAnim,
    easing: easingAnim,
  })

  Array.prototype.forEach.call(items, (item) => {
    const actualItemPos = item.getBoundingClientRect()
    const diff = {
      x: mainPos.left - actualItemPos.left,
      y: mainPos.top - actualItemPos.top,
    }

    anime({
      targets: item,
      translateX: [\`+=\${diff.x * 3 + offset}\`, 0],
      translateY: [\`+=\${diff.y * 3 + offset}\`, 0],
      rotate: [20, 0],
      easing: easingAnim,
      duration: durationAnim,
    })
  })
` }] });
const $$Astro$7 = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/MainImage.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$MainImage = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$7, $$props, $$slots);
  Astro2.self = $$MainImage;
  return renderTemplate`${maybeRenderHead($$result)}<svg id="image" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1589.32 1137.51"><title>Image</title><g class="main-item" id="sobre-behind"><path d="M1404.81,695.31l-288,290.49a3.53,3.53,0,0,0,0,5l176.89,175.39a3.54,3.54,0,0,0,5,0l288-290.49a3.53,3.53,0,0,0,0-5L1409.82,695.28A3.55,3.55,0,0,0,1404.81,695.31Z" transform="translate(-1.98 -33.25)" style="fill:#bebebe"></path><path d="M1407.32,697.79l176.89,175.39-288,290.49L1119.3,988.28Zm-5-5-288,290.49a7.09,7.09,0,0,0,0,10l176.89,175.39a7.1,7.1,0,0,0,10,0l288-290.49a7.07,7.07,0,0,0,0-10L1412.31,692.76a7.09,7.09,0,0,0-10,0Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1121.81,990.78a3.54,3.54,0,0,1-5.64-.9,3.49,3.49,0,0,1-.35-2.15l40.49-247.89a3.5,3.5,0,0,1,1-1.92,3.61,3.61,0,0,1,1.92-1l247.53-42.6a3.54,3.54,0,0,1,3.1,6Z" transform="translate(-1.98 -33.25)" style="fill:#bebebe"></path><path d="M1159.78,740.4l247.54-42.61-288,290.49Zm-5-5a7.09,7.09,0,0,0-2,3.84l-40.48,247.89a7,7,0,0,0,.67,4.33,7.08,7.08,0,0,0,11.34,1.79l288-290.49a7.08,7.08,0,0,0-6.25-11.93l-247.54,42.6a7,7,0,0,0-3.82,2Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path>
  </g><g class="item-anim" id="foto"><path d="M1189.57,976.33a2.48,2.48,0,0,1-1.21.68,2.41,2.41,0,0,1-1.38-.07l-146.55-49.76a2.52,2.52,0,0,1-1.57-3.18l49.79-146.57a2.42,2.42,0,0,1,.49-.85,2.6,2.6,0,0,1,1.72-.85,2.65,2.65,0,0,1,1,.13l146.55,49.76a2.77,2.77,0,0,1,.85.49,2.67,2.67,0,0,1,.6.78,2.62,2.62,0,0,1,.25,1,2.45,2.45,0,0,1-.13,1l-49.79,146.57A2.42,2.42,0,0,1,1189.57,976.33Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M1091,778.25,1237.56,828l-49.78,146.56L1041.24,924.8Zm-3.57-3.53a5,5,0,0,0-1.18,1.91l-49.78,146.56a5.17,5.17,0,0,0-.26,1.95,5.26,5.26,0,0,0,.51,1.9,5.07,5.07,0,0,0,2.9,2.53l146.55,49.76a5.14,5.14,0,0,0,2,.26,5,5,0,0,0,1.89-.51,5,5,0,0,0,2.54-2.9l49.77-146.55a5,5,0,0,0-.25-3.85,5.18,5.18,0,0,0-1.19-1.56,5.29,5.29,0,0,0-1.71-1l-146.55-49.75a5.11,5.11,0,0,0-2.77-.13,5,5,0,0,0-2.42,1.36Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1157.6,948.49a2.48,2.48,0,0,1-1.21.68,2.53,2.53,0,0,1-1.39-.06l-95.09-32.29a2.54,2.54,0,0,1-1.44-1.27,2.51,2.51,0,0,1-.13-1.92l39.43-116.1a2.57,2.57,0,0,1,.59-1,2.5,2.5,0,0,1,2.6-.61l95.09,32.29a2.42,2.42,0,0,1,.85.49,2.37,2.37,0,0,1,.59.78,2.47,2.47,0,0,1,.13,1.92l-39.43,116.1A2.67,2.67,0,0,1,1157.6,948.49Z" transform="translate(-1.98 -33.25)" style="fill:#73cae6"></path><path d="M1100.15,798.34l95.09,32.29-39.43,116.1-95.09-32.3Zm-3.57-3.54a5,5,0,0,0-1.19,1.92L1056,912.82a5.17,5.17,0,0,0-.26,1.95,5,5,0,0,0,.51,1.89,4.83,4.83,0,0,0,1.2,1.56,5,5,0,0,0,1.7,1l95.09,32.29a5.17,5.17,0,0,0,2,.26,5,5,0,0,0,1.89-.51,5.21,5.21,0,0,0,1.35-1,5.11,5.11,0,0,0,1.2-1.93L1200,832.24a4.91,4.91,0,0,0,.27-1.94,5.21,5.21,0,0,0-.51-1.9,5,5,0,0,0-2.91-2.54l-95.09-32.29a5,5,0,0,0-5.19,1.23Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1109.15,898.41a16.26,16.26,0,1,1,3.83-6.2A16,16,0,0,1,1109.15,898.41Z" transform="translate(-1.98 -33.25)" style="fill:#fdf5bc"></path><path d="M1087.83,877.33a13.75,13.75,0,1,1-3.23,5.24A13.69,13.69,0,0,1,1087.83,877.33Zm-3.57-3.54a18.76,18.76,0,0,0,7.31,31,18.88,18.88,0,0,0,19.37-4.58,18.48,18.48,0,0,0,4.43-7.17,18.76,18.76,0,0,0-31.1-19.22Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1158.25,946.58a2.44,2.44,0,0,1-.82.56,2.61,2.61,0,0,1-1,.19,2.5,2.5,0,0,1-1-.19,2.63,2.63,0,0,1-.82-.55c-1.14-1.13-27.78-28.12-28.68-45.1-.2-3.83,1.88-7.89,6.35-12.42,14.49-14.63,50.08-29.68,51.59-30.32a2.6,2.6,0,0,1,1.41-.16,2.54,2.54,0,0,1,2,1.87,2.46,2.46,0,0,1-.06,1.42l-28.46,83.74A2.55,2.55,0,0,1,1158.25,946.58Z" transform="translate(-1.98 -33.25)" style="fill:#36b49f"></path><path d="M1134.13,890.85c14.29-14.43,50.77-29.77,50.77-29.77l-28.43,83.74s-27.1-27.25-28-43.46c-.18-3.27,2-6.87,5.63-10.52m-3.57-3.53c-5,5.07-7.33,9.74-7.09,14.32.93,17.63,26.51,43.8,29.42,46.73a5,5,0,0,0,4.7,1.35,4.91,4.91,0,0,0,2.23-1.17,5,5,0,0,0,1.39-2.11l28.44-83.73a5,5,0,0,0-1.33-5.29,5,5,0,0,0-5.37-.95c-1.53.63-37.57,15.89-52.39,30.86Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1168.58,916.15a2.55,2.55,0,0,1-2,.74,2.51,2.51,0,0,1-1-.31,2.48,2.48,0,0,1-.81-.7c-1.37-1.84-33.76-45.36-34.65-62.15-.14-2.73,1-5.33,3.35-7.73,12.38-12.51,59.49-17.65,61.49-17.87a2.53,2.53,0,0,1,2.23.93,2.51,2.51,0,0,1,.51,1.14,2.6,2.6,0,0,1-.09,1.24l-28.44,83.74A2.59,2.59,0,0,1,1168.58,916.15Z" transform="translate(-1.98 -33.25)" style="fill:#36b49f"></path><path d="M1135.27,847.76c11.89-12,60-17.13,60-17.13l-28.45,83.75s-33.3-44.57-34.15-60.78a7.72,7.72,0,0,1,2.62-5.83m-3.57-3.54c-3.59,3.64-4.2,7.25-4.07,9.64.91,17.24,31.65,58.83,35.16,63.52a5,5,0,0,0,2.13,1.65,5,5,0,0,0,6.65-3L1200,832.25a5,5,0,0,0,.19-2.48,5,5,0,0,0-3-3.77,5.09,5.09,0,0,0-2.47-.36c-5.09.53-50.22,5.68-63,18.6Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path>
  </g><g class="main-item" id="hoja"><path d="M1284.53,1016.38a2,2,0,0,1-1.24,0,2,2,0,0,1-1-.7L1138.47,829.19a2.07,2.07,0,0,1-.34-.7,1.82,1.82,0,0,1-.05-.77,2,2,0,0,1,.25-.74,2,2,0,0,1,.52-.58l116.76-89.16a1.83,1.83,0,0,1,.7-.34,2,2,0,0,1,.78-.06l48.83,6.28a2.16,2.16,0,0,1,.74.25,1.78,1.78,0,0,1,.58.51L1429.9,903a2,2,0,0,1-.37,2.79l-144.46,110.3A1.76,1.76,0,0,1,1284.53,1016.38Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M1256.85,738.81l48.83,6.27,122.66,159.13-144.48,110.3L1140.06,828Zm-1.34-3.73a4.11,4.11,0,0,0-1.09.59l-116.75,89.16a3.94,3.94,0,0,0-.76,5.57L1280.71,1017a3.83,3.83,0,0,0,1.17,1,4,4,0,0,0,1.47.5,4.06,4.06,0,0,0,3-.8l144.46-110.31a4,4,0,0,0,1.45-4.18,3.94,3.94,0,0,0-.69-1.39L1308.84,742.66a4,4,0,0,0-1.18-1,4,4,0,0,0-1.48-.49l-48.84-6.27A3.93,3.93,0,0,0,1255.51,735.08Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1278.24,771.08a2,2,0,0,1-2.33-.75l-20.74-30.4a2,2,0,0,1-.32-.84,2.11,2.11,0,0,1,.08-.9,2.08,2.08,0,0,1,.48-.77,2.07,2.07,0,0,1,1.71-.58l48.83,6.28a2,2,0,0,1,1.66,1.39,2,2,0,0,1,0,1.13,2,2,0,0,1-.62,1l-28.1,24.11A2.22,2.22,0,0,1,1278.24,771.08Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M1256.85,738.81l48.83,6.27-28.11,24.13Zm-1.34-3.73a4.16,4.16,0,0,0-1.53,1,4.12,4.12,0,0,0-.94,1.55,4,4,0,0,0-.16,1.79,3.91,3.91,0,0,0,.66,1.67l20.74,30.4a4,4,0,0,0,2.78,1.7,3.93,3.93,0,0,0,1.67-.13,4.16,4.16,0,0,0,1.47-.81l28.06-24.14a4,4,0,0,0,1.25-1.9,3.95,3.95,0,0,0-1.24-4.15,4.07,4.07,0,0,0-2.08-.9l-48.84-6.27A4,4,0,0,0,1255.51,735.08Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1197.25,854.2l97.91-74.77" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M1210.2,871l97.91-74.77" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M1223.14,887.8,1321.06,813" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M1236.09,904.59,1334,829.83" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M1249,921.39,1347,846.63" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M1262,938.19l97.92-74.77" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M1274.94,955l97.92-74.77" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M1287.89,971.79,1385.81,897" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path>
  </g><g class="main-item" id="sobre-infront"><path d="M1298.7,1166.16a3.54,3.54,0,0,1-5,0L1116.81,990.8a3.6,3.6,0,0,1-1-1.66,3.68,3.68,0,0,1,.06-1.92,3.59,3.59,0,0,1,2.78-2.42l245-42.17,40.09-245.41a3.52,3.52,0,0,1,1-1.91,3.44,3.44,0,0,1,1.42-.88,3.52,3.52,0,0,1,3.58.85L1586.7,870.67a3.52,3.52,0,0,1,0,5Z" transform="translate(-1.98 -33.25)" style="fill:#f3f3f3"></path><path d="M1407.32,697.79l176.89,175.39-288,290.49L1119.3,988.28l247.53-42.59Zm-5-5a7,7,0,0,0-2,3.85l-39.68,242.91L1118.1,981.32a7,7,0,0,0-5.87,7,7.07,7.07,0,0,0,2.09,5l176.89,175.39a7.1,7.1,0,0,0,10,0l288-290.49a7.07,7.07,0,0,0,0-10L1412.31,692.76a7.09,7.09,0,0,0-10,0Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1298.7,1166.16a3.46,3.46,0,0,1-2,1,3.5,3.5,0,0,1-2.22-.41,3.52,3.52,0,0,1-1.72-3.91l55.56-232.93a3.52,3.52,0,0,1,2.6-2.62l232.45-57.55a3.54,3.54,0,0,1,4.36,3.9,3.47,3.47,0,0,1-1,2Z" transform="translate(-1.98 -33.25)" style="fill:#fff"></path><path d="M1351.75,930.74l232.46-57.56-288,290.49Zm-5-5a7,7,0,0,0-1.86,3.34L1289.31,1162a7.07,7.07,0,0,0,11.91,6.63l288-290.49a7.08,7.08,0,0,0-6.73-11.86l-232.45,57.56A7,7,0,0,0,1346.73,925.76Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path>
  </g><g class="item-anim" id="hoja-2" data-name="hoja"><path d="M1039.67,822.68a2,2,0,0,1-.89.86,2,2,0,0,1-1.22.16L806.11,781a1.87,1.87,0,0,1-.72-.28,2.06,2.06,0,0,1-.56-.54,1.93,1.93,0,0,1-.3-.71,1.86,1.86,0,0,1,0-.78L831,635.22a2,2,0,0,1,.28-.72,2.09,2.09,0,0,1,.55-.56l40.3-27.74a2.14,2.14,0,0,1,.71-.31,2,2,0,0,1,.78,0l197.43,36.44a2.14,2.14,0,0,1,.72.29,1.92,1.92,0,0,1,.56.54,1.8,1.8,0,0,1,.3.71,1.86,1.86,0,0,1,0,.78L1039.87,822.1A1.74,1.74,0,0,1,1039.67,822.68Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M833,635.55l40.3-27.74,197.43,36.44-32.78,177.49L806.47,779Zm-3.49-1.87a3.83,3.83,0,0,0-.41,1.16L802.59,778.28a3.9,3.9,0,0,0,0,1.56,3.74,3.74,0,0,0,.61,1.42,3.81,3.81,0,0,0,1.11,1.08,4,4,0,0,0,1.44.57l231.46,42.72a4,4,0,0,0,1.55,0,3.92,3.92,0,0,0,1.42-.62,3.81,3.81,0,0,0,1.08-1.11,4,4,0,0,0,.57-1.44L1074.62,645a4,4,0,0,0-1.74-4.05,4,4,0,0,0-1.44-.57L874,603.92a4,4,0,0,0-1.55,0,4,4,0,0,0-1.43.62l-40.3,27.75A3.88,3.88,0,0,0,829.48,633.68Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M870.43,645.25a2,2,0,0,1-.94.88,1.94,1.94,0,0,1-1.28.11l-35.73-8.74a2,2,0,0,1-1.34-1.13,1.93,1.93,0,0,1-.16-.89,1.89,1.89,0,0,1,.24-.86,2,2,0,0,1,.63-.7l40.3-27.74a2.07,2.07,0,0,1,1.07-.36,2,2,0,0,1,1.1.29,1.91,1.91,0,0,1,.75.84,1.93,1.93,0,0,1,.18,1.11l-4.59,36.48A2,2,0,0,1,870.43,645.25Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M833,635.55l40.3-27.74-4.58,36.51Zm-3.49-1.87a4.08,4.08,0,0,0-.48,1.74,4,4,0,0,0,.34,1.76,4,4,0,0,0,1.09,1.43,3.86,3.86,0,0,0,1.6.81l35.73,8.74a3.88,3.88,0,0,0,1.66.06,3.94,3.94,0,0,0,1.54-.64,4,4,0,0,0,1.14-1.21,3.82,3.82,0,0,0,.54-1.57l4.55-36.49a4,4,0,0,0-1.87-3.9,4,4,0,0,0-4.32.14l-40.31,27.74A4,4,0,0,0,829.48,633.68Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M866.34,760.51l22.2-120.3" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M887.18,764.36l22.21-120.3" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M908,768.21l22.21-120.3" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M928.86,772.05l22.21-120.3" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M949.71,775.9l22.21-120.3" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M970.55,779.74l22.21-120.29" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M991.39,783.59,1013.6,663.3" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M1012.23,787.44l22.21-120.3" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path>
  </g><g class="item-anim" id="foto-2" data-name="foto"><path d="M1164.7,749.92a2.42,2.42,0,0,1-1.29-.5,2.47,2.47,0,0,1-.84-1.1L1107.18,603.8a2.51,2.51,0,0,1,1.44-3.24l144.55-55.39a2.58,2.58,0,0,1,1-.16,2.63,2.63,0,0,1,1,.21,2.66,2.66,0,0,1,.8.57,2.48,2.48,0,0,1,.52.83l55.4,144.51a2.67,2.67,0,0,1,.16,1,2.45,2.45,0,0,1-.22,1,2.52,2.52,0,0,1-1.4,1.32l-144.54,55.38A2.46,2.46,0,0,1,1164.7,749.92Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M1254.05,547.52,1309.44,692l-144.53,55.38L1109.52,602.9Zm.43-5a5,5,0,0,0-2.23.32l-144.53,55.38a5.06,5.06,0,0,0-3.23,4.57,5.16,5.16,0,0,0,.34,1.94l55.39,144.5a5,5,0,0,0,2.65,2.8,5,5,0,0,0,3.86.1l144.52-55.39a5,5,0,0,0,1.66-1,5.08,5.08,0,0,0,1.14-1.61,4.85,4.85,0,0,0,.43-1.92,5.06,5.06,0,0,0-.33-1.93l-55.41-144.51a5,5,0,0,0-4.26-3.21Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1165.67,707.53a2.52,2.52,0,0,1-1.29-.49,2.5,2.5,0,0,1-.84-1.11l-35.94-93.77a2.51,2.51,0,0,1,.05-1.92,2.57,2.57,0,0,1,1.4-1.33L1243.54,565a2.53,2.53,0,0,1,1.12-.16,2.45,2.45,0,0,1,1.29.5,2.38,2.38,0,0,1,.83,1.1l36,93.77a2.47,2.47,0,0,1,.16,1,2.63,2.63,0,0,1-.21,1,2.66,2.66,0,0,1-.57.8,2.48,2.48,0,0,1-.83.52l-114.5,43.88A2.46,2.46,0,0,1,1165.67,707.53Z" transform="translate(-1.98 -33.25)" style="fill:#73cae6"></path><path d="M1244.44,567.38l35.94,93.78L1165.89,705,1130,611.26Zm.44-5a5,5,0,0,0-2.24.31l-114.49,43.87a5.14,5.14,0,0,0-1.66,1.05,5.08,5.08,0,0,0-1.14,1.61,5,5,0,0,0-.43,1.91,5,5,0,0,0,.34,1.94l35.94,93.77a5.12,5.12,0,0,0,1,1.66,5,5,0,0,0,1.61,1.13,5,5,0,0,0,3.85.11l114.5-43.87a5,5,0,0,0,3.23-4.57,5.16,5.16,0,0,0-.34-1.94l-35.94-93.77a5,5,0,0,0-4.26-3.21Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1173.23,638.27a16.25,16.25,0,1,1,7.22-1A16.27,16.27,0,0,1,1173.23,638.27Z" transform="translate(-1.98 -33.25)" style="fill:#fdf5bc"></path><path d="M1175.81,608.39a13.78,13.78,0,1,1-6.09.87A13.74,13.74,0,0,1,1175.81,608.39Zm.44-5a18.76,18.76,0,0,0-3.24,37.38,18.76,18.76,0,0,0,20.21-21.31,18.75,18.75,0,0,0-17-16.07Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1167.56,706.81a2.46,2.46,0,0,1-1-.27,2.39,2.39,0,0,1-.76-.62,2.27,2.27,0,0,1-.47-.86,2.33,2.33,0,0,1-.1-1c.13-1.61,3.87-39.35,16.35-50.89,2.81-2.6,7.27-3.6,13.61-3.05,20.51,1.79,54.84,19.54,56.28,20.29a2.52,2.52,0,0,1,.88,3.72,2.5,2.5,0,0,1-1.14.86l-82.59,31.64A2.61,2.61,0,0,1,1167.56,706.81Z" transform="translate(-1.98 -33.25)" style="fill:#36b49f"></path><path d="M1195,652.65c20.24,1.76,55.35,20,55.35,20l-82.57,31.65s3.63-38.25,15.55-49.28c2.41-2.22,6.57-2.83,11.69-2.38m.43-5c-7.1-.62-12.17.59-15.54,3.7-13,12-16.75,48.39-17.14,52.5a5,5,0,0,0,4.29,5.44,4.88,4.88,0,0,0,2.51-.28l82.58-31.64a5,5,0,0,0,2.26-1.72,5.13,5.13,0,0,0,1-2.68,5,5,0,0,0-2.7-4.75c-1.47-.76-36.24-18.73-57.23-20.56Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M1197.57,695.31a2.44,2.44,0,0,1-1-.32,2.4,2.4,0,0,1-.8-.72,2.54,2.54,0,0,1-.43-1,2.41,2.41,0,0,1,0-1.07c.54-2.24,13.31-55,25.64-66.38,2-1.86,4.74-2.65,8.09-2.36,17.54,1.53,51.61,34.47,53.05,35.87a2.51,2.51,0,0,1,.71,2.31,2.62,2.62,0,0,1-.55,1.12,2.47,2.47,0,0,1-1,.72l-82.57,31.65A2.57,2.57,0,0,1,1197.57,695.31Z" transform="translate(-1.98 -33.25)" style="fill:#36b49f"></path><path d="M1228.87,626c16.85,1.47,51.51,35.18,51.51,35.18l-82.59,31.64s13-54.1,24.91-65.11a7.71,7.71,0,0,1,6.17-1.71m.43-5c-5.09-.45-8.26,1.4-10,3-12.67,11.72-25,61.94-26.39,67.64a5,5,0,0,0,.1,2.69,5.17,5.17,0,0,0,1.47,2.26,5,5,0,0,0,5.12.91l82.58-31.65a5,5,0,0,0,2-1.44,5,5,0,0,0,1-4.73,5.13,5.13,0,0,0-1.3-2.12c-3.67-3.58-36.47-35-54.57-36.58Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path>
  </g><g class="item-anim" id="foto-3" data-name="foto"><path d="M755.48,668.73a2.53,2.53,0,0,1-1.29.52,2.45,2.45,0,0,1-1.36-.24L613.71,601.2a2.52,2.52,0,0,1-1.28-1.44,2.56,2.56,0,0,1,.12-1.92l67.84-139.13a2.51,2.51,0,0,1,.59-.78,2.61,2.61,0,0,1,.85-.5,2.53,2.53,0,0,1,1.92.12l139.12,67.81a2.67,2.67,0,0,1,.78.6,2.3,2.3,0,0,1,.49.84,2.53,2.53,0,0,1,.13,1,2.35,2.35,0,0,1-.25.94L756.18,667.86A2.37,2.37,0,0,1,755.48,668.73Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M682.64,459.82l139.11,67.81L753.93,666.75,614.81,598.94Zm-3.1-4a5,5,0,0,0-1.42,1.75L610.29,596.74a5.05,5.05,0,0,0-.5,1.9,5,5,0,0,0,.27,2,4.89,4.89,0,0,0,1,1.69,5,5,0,0,0,1.56,1.19l139.12,67.81a5.05,5.05,0,0,0,1.9.5,5,5,0,0,0,2-.27,4.89,4.89,0,0,0,1.69-1,5,5,0,0,0,1.19-1.57l67.82-139.12a5.21,5.21,0,0,0,.51-1.9,5,5,0,0,0-.27-1.95,5.05,5.05,0,0,0-1-1.69A5,5,0,0,0,824,523.1L684.84,455.3a5.08,5.08,0,0,0-2.74-.48,5,5,0,0,0-2.57,1.05Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M727.26,637.09a2.53,2.53,0,0,1-1.28.52,2.49,2.49,0,0,1-1.37-.24l-90.27-44a2.57,2.57,0,0,1-1.28-1.45,2.53,2.53,0,0,1,.12-1.91L686.91,479.8a2.45,2.45,0,0,1,.71-.88,2.53,2.53,0,0,1,1.29-.52,2.47,2.47,0,0,1,1.36.24l90.27,44a2.51,2.51,0,0,1,.78.59,2.61,2.61,0,0,1,.5.85,2.65,2.65,0,0,1,.13,1,2.57,2.57,0,0,1-.25,1L728,636.22A2.7,2.7,0,0,1,727.26,637.09Z" transform="translate(-1.98 -33.25)" style="fill:#73cae6"></path><path d="M689.17,480.89l90.27,44L725.71,635.11l-90.27-44Zm-3.1-3.95a5,5,0,0,0-1.41,1.75L630.92,588.9a5.05,5.05,0,0,0-.5,1.9,5.08,5.08,0,0,0,1.26,3.65,5.15,5.15,0,0,0,1.56,1.18l90.28,44a5,5,0,0,0,1.89.5,5.17,5.17,0,0,0,2-.26,5.07,5.07,0,0,0,1.46-.8,5.16,5.16,0,0,0,1.43-1.75L784,527.1a5,5,0,0,0,.51-1.9,4.91,4.91,0,0,0-.27-1.94,4.84,4.84,0,0,0-1-1.7,4.92,4.92,0,0,0-1.57-1.18l-90.27-44a5,5,0,0,0-5.3.56Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M685.51,581.3a16.2,16.2,0,1,1,4.58-5.66A16.21,16.21,0,0,1,685.51,581.3Z" transform="translate(-1.98 -33.25)" style="fill:#fdf5bc"></path><path d="M667,557.71a13.76,13.76,0,1,1-3.86,4.79A13.76,13.76,0,0,1,667,557.71Zm-3.09-4a18.77,18.77,0,1,0,11.72-4,18.71,18.71,0,0,0-11.72,4Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M728.15,635.27a2.45,2.45,0,0,1-.88.45,2.51,2.51,0,0,1-1,.07,2.47,2.47,0,0,1-1.68-1c-1-1.26-24-31.39-22.78-48.35.28-3.82,2.85-7.59,7.87-11.52,16.21-12.69,53.41-23.15,55-23.58a2.51,2.51,0,0,1,2.61.81,2.54,2.54,0,0,1,.57,1.31,2.59,2.59,0,0,1-.24,1.4l-38.78,79.5A2.45,2.45,0,0,1,728.15,635.27Z" transform="translate(-1.98 -33.25)" style="fill:#36b49f"></path><path d="M711.23,577c16-12.52,54.12-23.14,54.12-23.14L726.6,633.3s-23.45-30.44-22.27-46.64c.24-3.26,2.87-6.55,6.91-9.71m-3.09-4c-5.61,4.39-8.5,8.74-8.83,13.31-1.3,17.61,20.78,46.8,23.29,50.07a5,5,0,0,0,6.86,1,5,5,0,0,0,1.64-1.92L769.87,556a5,5,0,0,0,.47-2.8,5,5,0,0,0-3.49-4.19,5,5,0,0,0-2.85,0c-1.59.45-39.27,11-55.85,24Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M742.23,606.38a2.55,2.55,0,0,1-1,.46,2.42,2.42,0,0,1-1.07,0,2.54,2.54,0,0,1-1-.43,2.5,2.5,0,0,1-.72-.8c-1.13-2-27.78-49.25-26.55-66,.2-2.73,1.64-5.17,4.3-7.24,13.85-10.86,61.24-10,63.24-10a2.49,2.49,0,0,1,2.1,1.2,2.64,2.64,0,0,1,.37,1.19,2.48,2.48,0,0,1-.26,1.23L742.94,605.5A2.51,2.51,0,0,1,742.23,606.38Z" transform="translate(-1.98 -33.25)" style="fill:#36b49f"></path><path d="M717.79,534.35c13.31-10.43,61.65-9.45,61.65-9.45l-38.76,79.5S713.25,556,714.44,539.81a7.75,7.75,0,0,1,3.34-5.46m-3.09-4c-4,3.15-5.09,6.66-5.26,9-1.26,17.22,24,62.35,26.88,67.44a5,5,0,0,0,8.89-.27L784,527.11a5,5,0,0,0-2-6.56,4.91,4.91,0,0,0-2.4-.66c-5.12-.12-50.54-.69-64.85,10.51Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path>
  </g><g class="item-anim" id="hoja-3" data-name="hoja"><path d="M981.1,616.44a2,2,0,0,1-1.24,0,1.94,1.94,0,0,1-1-.76L846,421.4a1.9,1.9,0,0,1-.3-.72,1.82,1.82,0,0,1,0-.77,1.74,1.74,0,0,1,.29-.72,1.92,1.92,0,0,1,.54-.56l120.4-82.35a2,2,0,0,1,.71-.3,1.86,1.86,0,0,1,.78,0l48.09,9a1.93,1.93,0,0,1,.72.28,2.06,2.06,0,0,1,.55.55l113.35,165.7a2,2,0,0,1,0,2.21,1.8,1.8,0,0,1-.55.55L981.65,616.17A2,2,0,0,1,981.1,616.44Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M968.07,337.91l48.09,9,113.35,165.7-149,101.89L847.64,420.27Zm-1.14-3.79a4,4,0,0,0-1.1.53L845.43,417a4.11,4.11,0,0,0-1.09,1.11,4,4,0,0,0,0,4.41L977.27,616.78a4,4,0,0,0,2.55,1.67,4,4,0,0,0,3-.63l149-101.89a4,4,0,0,0,1.09-1.11,3.87,3.87,0,0,0,.57-1.43,4,4,0,0,0,0-1.55,4,4,0,0,0-.62-1.43L1019.42,344.7a4,4,0,0,0-1.12-1.08,3.82,3.82,0,0,0-1.44-.57l-48.1-9A4,4,0,0,0,966.93,334.12Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M987.6,371.32a1.94,1.94,0,0,1-1.28-.05,2,2,0,0,1-1-.82l-19-31.51a1.86,1.86,0,0,1-.28-.86,1.89,1.89,0,0,1,.13-.88,1.92,1.92,0,0,1,1.3-1.18,2,2,0,0,1,.94,0l48.09,9a1.94,1.94,0,0,1,1,.5,2.1,2.1,0,0,1,.56,1,2,2,0,0,1-.06,1.13,2,2,0,0,1-.66.91L988.27,371A1.93,1.93,0,0,1,987.6,371.32Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M968.07,337.91l48.09,9L987,369.42Zm-1.14-3.79a4,4,0,0,0-1.56.89,4,4,0,0,0-1,1.48,4,4,0,0,0,.31,3.49l19,31.5a3.91,3.91,0,0,0,2.66,1.86,4,4,0,0,0,1.66,0,4,4,0,0,0,1.5-.73l29.08-22.5a4,4,0,0,0-1.69-7l-48.1-9A4.1,4.1,0,0,0,966.93,334.12Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M903,449.68l101-69.07" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M915,467.17l101-69.06" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M926.91,484.66l101-69.06" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M938.88,502.15l101-69.06" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M950.84,519.65l101-69.06" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M962.81,537.15l101-69.07" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M974.78,554.64l101-69.06" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M986.74,572.13l101-69.06" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path>
  </g><g class="item-anim" id="hoja-4" data-name="hoja"><path d="M664.48,432.53A2,2,0,0,1,662.7,431L608.62,202a1.72,1.72,0,0,1,0-.78,1.85,1.85,0,0,1,.27-.72,1.7,1.7,0,0,1,.53-.57,2,2,0,0,1,.7-.32l142-33.52a2,2,0,0,1,.77,0,2.09,2.09,0,0,1,.73.28L795.18,192a2.06,2.06,0,0,1,.57.53,2,2,0,0,1,.32.7l46.14,195.39a2.05,2.05,0,0,1,0,.78,2.15,2.15,0,0,1-.27.73,2,2,0,0,1-.53.56,1.83,1.83,0,0,1-.71.32L665.09,432.49A2.07,2.07,0,0,1,664.48,432.53Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M752.54,168l41.63,25.72L840.3,389.09,664.64,430.55,610.55,201.49Zm.31-3.95a4.17,4.17,0,0,0-1.22.09l-142,33.52a4,4,0,0,0-1.41.64,4.22,4.22,0,0,0-1.06,1.13,4,4,0,0,0-.48,3l54.08,229.06a4,4,0,0,0,.64,1.41,4,4,0,0,0,1.14,1.06,3.81,3.81,0,0,0,1.45.54,3.85,3.85,0,0,0,1.55-.06L841.22,393a4,4,0,0,0,1.41-.64,4.12,4.12,0,0,0,1.06-1.14,3.91,3.91,0,0,0,.54-1.45,4.05,4.05,0,0,0-.06-1.55L798,192.79a4,4,0,0,0-.65-1.42,4.07,4.07,0,0,0-1.14-1.05L754.59,164.6A3.85,3.85,0,0,0,752.85,164Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M758.75,206.18a2.07,2.07,0,0,1-1.18-.51,1.93,1.93,0,0,1-.62-1.13l-6.38-36.22a1.83,1.83,0,0,1,0-.9,1.94,1.94,0,0,1,.44-.79,2.06,2.06,0,0,1,.74-.5,2.12,2.12,0,0,1,.9-.13,2,2,0,0,1,.89.3L795.21,192a2,2,0,0,1,.76.84,2,2,0,0,1,.17,1.11,2,2,0,0,1-.46,1,1.93,1.93,0,0,1-.95.61L759.49,206.1A2.06,2.06,0,0,1,758.75,206.18Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M752.54,168l41.63,25.72L758.9,204.2Zm.31-3.95a4,4,0,0,0-1.78.26,4.12,4.12,0,0,0-1.48,1,3.95,3.95,0,0,0-1,3.36L755,204.91a3.93,3.93,0,0,0,3.39,3.24,3.84,3.84,0,0,0,1.65-.13l35.23-10.53a3.95,3.95,0,0,0,2.82-3.28,3.93,3.93,0,0,0-1.87-3.9l-41.62-25.73A4,4,0,0,0,752.85,164Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M651.6,248.83l119.06-28.1" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M656.47,269.46l119.06-28.11" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M661.34,290.09,780.4,262" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M666.21,310.71l119.06-28.1" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M671.08,331.35l119.06-28.11" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M676,352,795,323.86" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M680.83,372.6l119-28.11" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M685.69,393.23l119.06-28.11" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path>
  </g><g class="item-anim" id="hoja-5" data-name="hoja"><path d="M535.68,685.58a2,2,0,0,1-1,.76,2,2,0,0,1-1.24,0L307.68,620a1.9,1.9,0,0,1-.69-.36,1.88,1.88,0,0,1-.5-.59,2,2,0,0,1-.23-.74,1.87,1.87,0,0,1,.07-.78l41.16-139.94a1.9,1.9,0,0,1,.36-.69,1.86,1.86,0,0,1,.59-.49l43-23.43a1.78,1.78,0,0,1,.74-.23,1.82,1.82,0,0,1,.77.07l192.61,56.64a2,2,0,0,1,.69.35,2.22,2.22,0,0,1,.5.6,2.13,2.13,0,0,1,.23.74,2.22,2.22,0,0,1-.07.77L535.94,685A2,2,0,0,1,535.68,685.58Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M349.41,478.1l42.95-23.43L585,511.31,534,684.46l-225.81-66.4Zm-3.28-2.22a3.76,3.76,0,0,0-.52,1.11L304.45,616.93a3.82,3.82,0,0,0-.14,1.54,3.87,3.87,0,0,0,.46,1.48,3.94,3.94,0,0,0,1,1.19,4.05,4.05,0,0,0,1.38.72l225.8,66.4a4,4,0,0,0,1.54.15,4.12,4.12,0,0,0,1.49-.47,4,4,0,0,0,1.9-2.37L588.8,512.43a4,4,0,0,0,.14-1.54,4.06,4.06,0,0,0-.46-1.48,4,4,0,0,0-2.37-1.91L393.48,450.87a4.07,4.07,0,0,0-1.55-.13,4,4,0,0,0-1.48.47l-43,23.43A4,4,0,0,0,346.13,475.88Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M385.67,491.61a1.94,1.94,0,0,1-1,.78,2,2,0,0,1-1.29,0L348.73,480a1.92,1.92,0,0,1-.76-.49,1.89,1.89,0,0,1-.46-.77,2,2,0,0,1,.26-1.73,2,2,0,0,1,.7-.63l42.95-23.43a2,2,0,0,1,2.16.15,2,2,0,0,1,.67.91,2,2,0,0,1,.06,1.13L386,490.93A1.82,1.82,0,0,1,385.67,491.61Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M349.41,478.1l42.95-23.43L384,490.51Zm-3.28-2.22a3.93,3.93,0,0,0-.49,3.46,3.87,3.87,0,0,0,.93,1.54,4.08,4.08,0,0,0,1.51,1l34.64,12.39a4,4,0,0,0,1.64.22A3.9,3.9,0,0,0,386,494a4,4,0,0,0,1.26-1.09,4,4,0,0,0,.7-1.5l8.29-35.83a3.92,3.92,0,0,0-.12-2.25,4,4,0,0,0-3.45-2.62,4,4,0,0,0-2.2.49l-43,23.43A4.07,4.07,0,0,0,346.13,475.88Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M369.69,605.83l34.52-117.36" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M390,611.81l34.51-117.36" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M410.36,617.79l34.52-117.35" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M430.69,623.77l34.52-117.36" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M451,629.75l34.52-117.36" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M471.36,635.73l34.52-117.36" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M491.7,641.71l34.51-117.36" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M512,647.69l34.51-117.36" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path>
  </g><g class="item-anim" id="hoja-6" data-name="hoja"><path d="M469,458.65a2,2,0,0,1-1.21.25,1.9,1.9,0,0,1-1.12-.51l-173.55-159a2,2,0,0,1-.46-.63,1.92,1.92,0,0,1-.18-.75,2,2,0,0,1,.12-.77,2,2,0,0,1,.4-.66L391.51,189a2,2,0,0,1,.63-.45,2,2,0,0,1,.75-.19l48.89-2.14a2,2,0,0,1,.76.12,2.17,2.17,0,0,1,.67.4l148,135.61a2.08,2.08,0,0,1,.47.63,1.92,1.92,0,0,1,.18.75,2,2,0,0,1-.12.77,2,2,0,0,1-.4.66L469.46,458.27A2,2,0,0,1,469,458.65Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M393,190.37l48.89-2.14,148,135.61L468,456.92l-173.55-159Zm-2-3.43a3.93,3.93,0,0,0-1,.76L291.55,295.26a3.83,3.83,0,0,0-.81,1.32,4,4,0,0,0-.24,1.53,4,4,0,0,0,1.29,2.76l173.55,159a3.83,3.83,0,0,0,1.32.81,4,4,0,0,0,1.54.24,4.09,4.09,0,0,0,1.5-.37,4.22,4.22,0,0,0,1.25-.92L592.87,326.53a4,4,0,0,0,.67-4.36,3.86,3.86,0,0,0-.92-1.24L444.55,185.31a4,4,0,0,0-2.87-1l-48.88,2.14A3.91,3.91,0,0,0,391,186.94Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M419.62,218.46a1.91,1.91,0,0,1-1.26.25,2,2,0,0,1-1.15-.58l-25.65-26.37a1.89,1.89,0,0,1-.46-.77,2,2,0,0,1,.25-1.73,2.17,2.17,0,0,1,.67-.61,2.22,2.22,0,0,1,.9-.26l48.89-2.13a2,2,0,0,1,1.09.26,2.08,2.08,0,0,1,.78.83,1.92,1.92,0,0,1,.19,1.11,1.87,1.87,0,0,1-.44,1L420.19,218A2,2,0,0,1,419.62,218.46Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M393,190.37l48.89-2.14-23.25,28.52Zm-2-3.43a3.93,3.93,0,0,0-1.32,1.21,4,4,0,0,0-.65,1.68,3.89,3.89,0,0,0,.16,1.79,3.94,3.94,0,0,0,.93,1.53l25.65,26.37a4.05,4.05,0,0,0,1.38.93,4,4,0,0,0,1.64.27,4,4,0,0,0,2.9-1.46l23.21-28.52a4,4,0,0,0,.89-2.08,4,4,0,0,0-.4-2.22,4,4,0,0,0-3.74-2.18L392.8,186.4A3.93,3.93,0,0,0,391,186.94Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M355,314l82.64-90.2" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M370.64,328.32l82.64-90.2" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M386.27,342.64l82.63-90.2" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M401.9,357l82.63-90.2" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M417.53,371.27l82.63-90.2" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M433.16,385.59l82.63-90.21" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M448.79,399.9l82.63-90.2" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M464.41,414.22,547.05,324" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path>
  </g><g class="item-anim" id="hoja-7" data-name="hoja"><path d="M190.47,335a2.16,2.16,0,0,1-2.54-.38L4.78,152.88a2.17,2.17,0,0,1-.48-.71,2.11,2.11,0,0,1,0-1.66,1.88,1.88,0,0,1,.47-.71L117.41,36.29a2.47,2.47,0,0,1,.71-.48,2.15,2.15,0,0,1,.83-.16l53.65-.21a2.2,2.2,0,0,1,.83.17,2.17,2.17,0,0,1,.71.46l156.23,155a2.21,2.21,0,0,1,.47.7,2.17,2.17,0,0,1,.17.84,2,2,0,0,1-.16.83,2.25,2.25,0,0,1-.47.71L191,334.61A2.1,2.1,0,0,1,190.47,335Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M119,37.81l53.64-.21,156.23,155L189.47,333.08,6.31,151.33ZM117,34a4.45,4.45,0,0,0-1.08.8L3.25,148.26a4.51,4.51,0,0,0-.94,1.42A4.33,4.33,0,0,0,2,151.35,4.48,4.48,0,0,0,2.32,153a4.38,4.38,0,0,0,1,1.41L186.43,336.17a4.37,4.37,0,0,0,1.42.95,4.5,4.5,0,0,0,1.66.32,4.37,4.37,0,0,0,3.08-1.29L332,195.71a4.35,4.35,0,0,0,1.27-3.08,4.29,4.29,0,0,0-.34-1.66,4.23,4.23,0,0,0-.95-1.41l-156.26-155a4.26,4.26,0,0,0-1.43-.93,4.17,4.17,0,0,0-1.67-.32l-53.65.2A4.43,4.43,0,0,0,117,34Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M146.91,69.75a2.15,2.15,0,0,1-1.39.21,2.1,2.1,0,0,1-1.23-.68l-26.94-30a2.1,2.1,0,0,1-.48-.86,2.21,2.21,0,0,1,0-1A2.16,2.16,0,0,1,118,35.89a2.14,2.14,0,0,1,1-.25l53.65-.2a2.11,2.11,0,0,1,1.19.34,2.22,2.22,0,0,1,.81.93,2.22,2.22,0,0,1-.36,2.35L147.56,69.25A2.3,2.3,0,0,1,146.91,69.75Z" transform="translate(-1.98 -33.25)" style="fill:#fcf7eb"></path><path d="M119,37.81l53.64-.21L145.91,67.82ZM117,34A4.36,4.36,0,0,0,114.7,37a4.23,4.23,0,0,0,.1,2,4.34,4.34,0,0,0,1,1.72l26.95,30a4.32,4.32,0,0,0,1.47,1.07,4.38,4.38,0,0,0,1.78.38,4.36,4.36,0,0,0,3.25-1.48l26.67-30.23a4.34,4.34,0,0,0-3.28-7.23l-53.65.2A4.5,4.5,0,0,0,117,34Z" transform="translate(-1.98 -33.25)" style="fill:#193847"></path><path d="M72,171.57l94.47-95.19" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M88.46,187.94l94.46-95.19" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M104.94,204.31l94.47-95.19" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M121.44,220.67l94.47-95.19" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M137.93,237l94.47-95.19" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M154.43,253.41l94.47-95.19" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M170.92,269.77l94.47-95.18" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path><path d="M187.41,286.14,281.88,191" transform="translate(-1.98 -33.25)" style="fill:none;stroke:#193847;stroke-linecap:round;stroke-linejoin:round;stroke-width:10.029999732971191px"></path>
  </g>
</svg>

`;
});

const $$file$6 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/MainImage.astro";
const $$url$6 = undefined;

const $$module3 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  $$metadata: $$metadata$6,
  default: $$MainImage,
  file: $$file$6,
  url: $$url$6
}, Symbol.toStringTag, { value: 'Module' }));

const $$metadata$5 = createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/FotoSVG.astro", { modules: [], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [] });
const $$Astro$6 = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/FotoSVG.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$FotoSVG = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$6, $$props, $$slots);
  Astro2.self = $$FotoSVG;
  return renderTemplate`${maybeRenderHead($$result)}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 209.99 209.96"><title>foto</title><g id="foto-svg" data-name="Capa 2"><g id="image-foto"><g id="foto"><path d="M60.21,207.43a2.54,2.54,0,0,1-2.13-1.61L2.69,61.31a2.52,2.52,0,0,1,1.44-3.25L148.68,2.68a2.4,2.4,0,0,1,1-.16,2.44,2.44,0,0,1,1,.21,2.66,2.66,0,0,1,.8.57,2.48,2.48,0,0,1,.52.83l55.4,144.51a2.67,2.67,0,0,1,.16,1,2.4,2.4,0,0,1-.22.95,2.29,2.29,0,0,1-.57.8,2.5,2.5,0,0,1-.83.53L61.32,207.27A2.61,2.61,0,0,1,60.21,207.43Z" style="fill:#fcf7eb"></path><path d="M149.56,5,205,149.54,60.42,204.92,5,60.41ZM150,0a5,5,0,0,0-2.23.31L3.23,55.72a5.08,5.08,0,0,0-1.66,1.05,5,5,0,0,0-1.13,1.6,4.95,4.95,0,0,0-.1,3.85L55.73,206.73a5,5,0,0,0,1.05,1.66,5,5,0,0,0,1.6,1.14,5.09,5.09,0,0,0,3.86.1l144.52-55.39a5,5,0,0,0,1.66-1.05,5,5,0,0,0,1.14-1.6,4.93,4.93,0,0,0,.43-1.92,5.06,5.06,0,0,0-.33-1.93L154.25,3.23A5,5,0,0,0,152.58,1,5,5,0,0,0,150,0Z" style="fill:#193847"></path><path d="M61.18,165a2.52,2.52,0,0,1-1.29-.49,2.55,2.55,0,0,1-.84-1.11L23.11,69.67a2.51,2.51,0,0,1,1.45-3.25L139.05,22.54a2.56,2.56,0,0,1,2.41.34,2.46,2.46,0,0,1,.83,1.11l36,93.77a2.47,2.47,0,0,1,.16,1,2.5,2.5,0,0,1-.78,1.76,2.65,2.65,0,0,1-.83.52L62.29,164.89A2.6,2.6,0,0,1,61.18,165Z" style="fill:#73cae6"></path><path d="M140,24.89l35.94,93.77L61.4,162.54,25.46,68.77Zm.44-5a5.05,5.05,0,0,0-2.24.32L23.66,64.07A5,5,0,0,0,22,65.12a5,5,0,0,0-1.14,1.6,5.11,5.11,0,0,0-.43,1.92,4.89,4.89,0,0,0,.34,1.93l35.94,93.78a5.23,5.23,0,0,0,1,1.66,5,5,0,0,0,1.61,1.13,5,5,0,0,0,3.85.11l114.5-43.88a5,5,0,0,0,3.23-4.56,5.12,5.12,0,0,0-.34-1.94L144.66,23.1A5.1,5.1,0,0,0,143,20.88a5,5,0,0,0-2.59-1Z" style="fill:#193847"></path><path d="M68.74,95.77a16.26,16.26,0,1,1,7.22-1A16,16,0,0,1,68.74,95.77Z" style="fill:#fdf5bc"></path><path d="M71.32,65.9a13.74,13.74,0,1,1-6.09.86A13.69,13.69,0,0,1,71.32,65.9Zm.44-5a18.77,18.77,0,0,0-3.24,37.39A18.76,18.76,0,0,0,88.73,77a18.77,18.77,0,0,0-17-16.08Z" style="fill:#193847"></path><path d="M63.07,164.32a2.65,2.65,0,0,1-1-.27,2.69,2.69,0,0,1-.76-.62,2.52,2.52,0,0,1-.57-1.85c.13-1.6,3.87-39.34,16.35-50.88,2.81-2.6,7.27-3.6,13.61-3,20.51,1.79,54.84,19.54,56.28,20.29a2.52,2.52,0,0,1,1,1,2.57,2.57,0,0,1,.33,1.38,2.63,2.63,0,0,1-.48,1.35,2.5,2.5,0,0,1-1.14.86L64.18,164.16A2.61,2.61,0,0,1,63.07,164.32Z" style="fill:#36b49f"></path><path d="M90.51,110.15c20.24,1.76,55.35,20,55.35,20L63.29,161.82s3.63-38.25,15.55-49.28c2.41-2.23,6.57-2.83,11.69-2.39m.43-5c-7.1-.62-12.17.59-15.54,3.7-13,12-16.75,48.38-17.14,52.49a5.1,5.1,0,0,0,.4,2.5,5,5,0,0,0,6.4,2.67l82.58-31.64a5,5,0,0,0,.52-9.15C146.71,125,111.94,107,91,105.16Z" style="fill:#193847"></path><path d="M93.08,152.81a2.44,2.44,0,0,1-1-.32,2.37,2.37,0,0,1-.8-.71,2.58,2.58,0,0,1-.43-1,2.42,2.42,0,0,1,0-1.07c.54-2.24,13.31-55,25.64-66.37A10.11,10.11,0,0,1,124.59,81c17.54,1.52,51.61,34.47,53,35.87a2.58,2.58,0,0,1,.65,1.06,2.64,2.64,0,0,1,.06,1.25,2.62,2.62,0,0,1-.55,1.12,2.47,2.47,0,0,1-1,.72L94.21,152.66A2.56,2.56,0,0,1,93.08,152.81Z" style="fill:#36b49f"></path><path d="M124.38,83.49c16.85,1.46,51.51,35.17,51.51,35.17L93.3,150.31s13-54.1,24.91-65.12a7.75,7.75,0,0,1,6.17-1.7m.43-5c-5.09-.44-8.26,1.4-10,3-12.67,11.72-25,61.94-26.39,67.63a5,5,0,0,0,1.57,5,5,5,0,0,0,5.12.92l82.58-31.65a5,5,0,0,0,3.13-3.68,5,5,0,0,0-.12-2.49,5.06,5.06,0,0,0-1.3-2.12c-3.67-3.58-36.47-35-54.57-36.58Z" style="fill:#193847"></path>
      </g>
    </g>
  </g>
</svg>`;
});

const $$file$5 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/FotoSVG.astro";
const $$url$5 = undefined;

const $$module1$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  $$metadata: $$metadata$5,
  default: $$FotoSVG,
  file: $$file$5,
  url: $$url$5
}, Symbol.toStringTag, { value: 'Module' }));

const $$metadata$4 = createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/InfoSection.astro", { modules: [{ module: $$module1$1, specifier: "./FotoSVG.astro", assert: {} }], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [] });
const $$Astro$5 = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/InfoSection.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$InfoSection = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$5, $$props, $$slots);
  Astro2.self = $$InfoSection;
  return renderTemplate`${maybeRenderHead($$result)}<section>
  <div class="information">
    <h2>A Large Title</h2>
    <p>
      Lorem ipsum dolor sit amet consectetur adipisicing elit. Obcaecati officia
      voluptatibus provident sit ipsum consequatur fugiat natus? Provident,
      velit voluptas! Quia ut dicta consequuntur voluptatum! In minima nesciunt
      sed qui.
    </p>
  </div>
  ${renderComponent($$result, "FotoSVG", $$FotoSVG, {})}
</section>`;
});

const $$file$4 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/InfoSection.astro";
const $$url$4 = undefined;

const $$module4 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  $$metadata: $$metadata$4,
  default: $$InfoSection,
  file: $$file$4,
  url: $$url$4
}, Symbol.toStringTag, { value: 'Module' }));

const $$metadata$3 = createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/infografias.astro", { modules: [], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [] });
const $$Astro$4 = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/infografias.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$Infografias = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$4, $$props, $$slots);
  Astro2.self = $$Infografias;
  return renderTemplate`${maybeRenderHead($$result)}<main>
  ${renderSlot($$result, $$slots["default"])}
</main>`;
});

const $$file$3 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/infografias.astro";
const $$url$3 = undefined;

const $$module5 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  $$metadata: $$metadata$3,
  default: $$Infografias,
  file: $$file$3,
  url: $$url$3
}, Symbol.toStringTag, { value: 'Module' }));

const $$metadata$2 = createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/Card.astro", { modules: [], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [] });
const $$Astro$3 = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/Card.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$Card = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$3, $$props, $$slots);
  Astro2.self = $$Card;
  const { title, desc, url } = Astro2.props;
  return renderTemplate`${maybeRenderHead($$result)}<article class="card">
  <h2 class="card__title">${title}</h2>
  <p class="card__body">
   ${desc}
  </p>
  <a class="card__btn"${addAttribute(url, "href")}>VER MÁS</a>
</article>`;
});

const $$file$2 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/Card.astro";
const $$url$2 = undefined;

const $$module6 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  $$metadata: $$metadata$2,
  default: $$Card,
  file: $$file$2,
  url: $$url$2
}, Symbol.toStringTag, { value: 'Module' }));

const $$metadata$1 = createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/pages/index.astro", { modules: [{ module: $$module1$2, specifier: "../layouts/Layout.astro", assert: {} }, { module: $$module2, specifier: "../components/MainTitle.astro", assert: {} }, { module: $$module3, specifier: "../components/MainImage.astro", assert: {} }, { module: $$module4, specifier: "../components/InfoSection.astro", assert: {} }, { module: $$module5, specifier: "../components/infografias.astro", assert: {} }, { module: $$module6, specifier: "../components/Card.astro", assert: {} }], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [] });
const $$Astro$2 = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/pages/index.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$2, $$props, $$slots);
  Astro2.self = $$Index;
  const allPost = await Astro2.glob(/* #__PURE__ */ Object.assign({"./blog/electiva.md": () => Promise.resolve().then(() => _page3),"./blog/salones.md": () => Promise.resolve().then(() => _page5),"./blog/servicio.md": () => Promise.resolve().then(() => _page4),"./blog/titulacion.md": () => Promise.resolve().then(() => _page2)}), () => "./blog/*.md");
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Tus Infograf\xEDas." }, { "default": () => renderTemplate`${maybeRenderHead($$result)}<header class="wrapper">
    <div class="container">
      ${renderComponent($$result, "MainTitle", $$MainTitle, {})}
    </div>
    <div class="svg">
      ${renderComponent($$result, "MainImage", $$MainImage, {})}
    </div>
  </header>${renderComponent($$result, "InfoSection", $$InfoSection, {})}${renderComponent($$result, "Infografias", $$Infografias, {}, { "default": () => renderTemplate`${allPost.map((post) => renderTemplate`${renderComponent($$result, "Card", $$Card, { "title": post.frontmatter.title, "desc": post.frontmatter.description, "url": post.url })}`)}` })}` })}`;
});

const $$file$1 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/pages/index.astro";
const $$url$1 = "";

const _page0 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  $$metadata: $$metadata$1,
  default: $$Index,
  file: $$file$1,
  url: $$url$1
}, Symbol.toStringTag, { value: 'Module' }));

const SITE_TITLE = 'Tus Infogracías.';
const SITE_DESCRIPTION = 'Bienvenido a tus infografías.';

const get = () =>
  rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: undefined,
    items: /* #__PURE__ */ Object.assign({"./blog/electiva.md": () => Promise.resolve().then(() => _page3),"./blog/salones.md": () => Promise.resolve().then(() => _page5),"./blog/servicio.md": () => Promise.resolve().then(() => _page4),"./blog/titulacion.md": () => Promise.resolve().then(() => _page2)}),
  });

const _page1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  get
}, Symbol.toStringTag, { value: 'Module' }));

const $$metadata = createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/ViewInfo.astro", { modules: [], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [] });
const $$Astro$1 = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/ViewInfo.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$ViewInfo = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$ViewInfo;
  const { link } = Astro2.props;
  return renderTemplate`${maybeRenderHead($$result)}<div class="infografia">
  <div class="info__container">
    <iframe${addAttribute(link, "src")} allowfullscreen="allowfullscreen" allow="fullscreen">
    </iframe>
  </div>
</div>`;
});

const $$file = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/components/ViewInfo.astro";
const $$url = undefined;

const $$module1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  $$metadata,
  default: $$ViewInfo,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

createMetadata("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/layouts/LayoutInfo.astro", { modules: [{ module: $$module1, specifier: "../components/ViewInfo.astro", assert: {} }], hydratedComponents: [], clientOnlyComponents: [], hydrationDirectives: /* @__PURE__ */ new Set([]), hoisted: [] });
const $$Astro = createAstro("/@fs/C:/Users/herna/Documents/Workspace/Astro/infografias/src/layouts/LayoutInfo.astro", "", "file:///C:/Users/herna/Documents/Workspace/Astro/infografias/");
const $$LayoutInfo = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$LayoutInfo;
  const {
    frontmatter: { title, link, filepath }
  } = Astro2.props;
  return renderTemplate`<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta name="generator"${addAttribute(Astro2.generator, "content")}>
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css">
  ${renderHead($$result)}</head>
  <body>
    <div class="container__view">
      <h2>${title}</h2>
      <nav>
        <a class="btn" href="/"><i class="fa-solid fa-arrow-left"></i>Regresar</a>
        <a class="btn"${addAttribute(filepath, "href")}${addAttribute(title, "download")}><i class="fa-solid fa-download"></i>Download</a>
        <a class="btn"${addAttribute(filepath, "href")} target="_blank">
          <i class="fa-solid fa-location-arrow"></i>
          Abrir
        </a>
      </nav>
      ${renderComponent($$result, "ViewInfo", $$ViewInfo, { "link": link })}
      ${renderSlot($$result, $$slots["default"])}
    </div>
  </body></html>`;
});

const html$3 = "";

				const frontmatter$3 = {"layout":"../../layouts/LayoutInfo.astro","title":"Titulacion Para Escom","description":"Lorem ipsum dolor sit, amet consectetur adipisicing elit. Possimus debitis culpa impedit quae quam? Corrupti.","link":"https://www.canva.com/design/DAEnRhu_h58/view?embed","filepath":"/pdf/TitulacionESCOM2009.pdf","pubDate":"Jul 08 2022"};
				const file$3 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/pages/blog/titulacion.md";
				const url$3 = "/blog/titulacion";
				function rawContent$3() {
					return "";
				}
				function compiledContent$3() {
					return html$3;
				}
				function getHeadings$3() {
					return [];
				}
				function getHeaders$3() {
					console.warn('getHeaders() have been deprecated. Use getHeadings() function instead.');
					return getHeadings$3();
				}				async function Content$3() {
					const { layout, ...content } = frontmatter$3;
					content.file = file$3;
					content.url = url$3;
					content.astro = {};
					Object.defineProperty(content.astro, 'headings', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "headings" from your layout, try using "Astro.props.headings."')
						}
					});
					Object.defineProperty(content.astro, 'html', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "html" from your layout, try using "Astro.props.compiledContent()."')
						}
					});
					Object.defineProperty(content.astro, 'source', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "source" from your layout, try using "Astro.props.rawContent()."')
						}
					});
					const contentFragment = createVNode(Fragment, { 'set:html': html$3 });
					return createVNode($$LayoutInfo, {
									file: file$3,
									url: url$3,
									content,
									frontmatter: content,
									headings: getHeadings$3(),
									rawContent: rawContent$3,
									compiledContent: compiledContent$3,
									'server:root': true,
									children: contentFragment
								});
				}
				Content$3[Symbol.for('astro.needsHeadRendering')] = false;

const _page2 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  frontmatter: frontmatter$3,
  file: file$3,
  url: url$3,
  rawContent: rawContent$3,
  compiledContent: compiledContent$3,
  getHeadings: getHeadings$3,
  getHeaders: getHeaders$3,
  Content: Content$3,
  default: Content$3
}, Symbol.toStringTag, { value: 'Module' }));

const html$2 = "";

				const frontmatter$2 = {"layout":"../../layouts/LayoutInfo.astro","title":"Electiva Escom 2009","description":"Lorem ipsum dolor sit, amet consectetur adipisicing elit. Possimus debitis culpa impedit quae quam? Corrupti.","link":"https://www.canva.com/design/DAE1S2W8Vrc/view?embed","filepath":"/pdf/ELECTIVA.pdf","pubDate":"Jul 08 2022"};
				const file$2 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/pages/blog/electiva.md";
				const url$2 = "/blog/electiva";
				function rawContent$2() {
					return "";
				}
				function compiledContent$2() {
					return html$2;
				}
				function getHeadings$2() {
					return [];
				}
				function getHeaders$2() {
					console.warn('getHeaders() have been deprecated. Use getHeadings() function instead.');
					return getHeadings$2();
				}				async function Content$2() {
					const { layout, ...content } = frontmatter$2;
					content.file = file$2;
					content.url = url$2;
					content.astro = {};
					Object.defineProperty(content.astro, 'headings', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "headings" from your layout, try using "Astro.props.headings."')
						}
					});
					Object.defineProperty(content.astro, 'html', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "html" from your layout, try using "Astro.props.compiledContent()."')
						}
					});
					Object.defineProperty(content.astro, 'source', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "source" from your layout, try using "Astro.props.rawContent()."')
						}
					});
					const contentFragment = createVNode(Fragment, { 'set:html': html$2 });
					return createVNode($$LayoutInfo, {
									file: file$2,
									url: url$2,
									content,
									frontmatter: content,
									headings: getHeadings$2(),
									rawContent: rawContent$2,
									compiledContent: compiledContent$2,
									'server:root': true,
									children: contentFragment
								});
				}
				Content$2[Symbol.for('astro.needsHeadRendering')] = false;

const _page3 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  frontmatter: frontmatter$2,
  file: file$2,
  url: url$2,
  rawContent: rawContent$2,
  compiledContent: compiledContent$2,
  getHeadings: getHeadings$2,
  getHeaders: getHeaders$2,
  Content: Content$2,
  default: Content$2
}, Symbol.toStringTag, { value: 'Module' }));

const html$1 = "";

				const frontmatter$1 = {"layout":"../../layouts/LayoutInfo.astro","title":"Servicio Social","description":"Lorem ipsum dolor sit, amet consectetur adipisicing elit. Possimus debitis culpa impedit quae quam? Corrupti.","link":"https://www.canva.com/design/DAE2Jgkt0rY/view?embed","filepath":"/pdf/SERVICIO SOCIAL.pdf","pubDate":"Jul 08 2022"};
				const file$1 = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/pages/blog/servicio.md";
				const url$1 = "/blog/servicio";
				function rawContent$1() {
					return "";
				}
				function compiledContent$1() {
					return html$1;
				}
				function getHeadings$1() {
					return [];
				}
				function getHeaders$1() {
					console.warn('getHeaders() have been deprecated. Use getHeadings() function instead.');
					return getHeadings$1();
				}				async function Content$1() {
					const { layout, ...content } = frontmatter$1;
					content.file = file$1;
					content.url = url$1;
					content.astro = {};
					Object.defineProperty(content.astro, 'headings', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "headings" from your layout, try using "Astro.props.headings."')
						}
					});
					Object.defineProperty(content.astro, 'html', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "html" from your layout, try using "Astro.props.compiledContent()."')
						}
					});
					Object.defineProperty(content.astro, 'source', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "source" from your layout, try using "Astro.props.rawContent()."')
						}
					});
					const contentFragment = createVNode(Fragment, { 'set:html': html$1 });
					return createVNode($$LayoutInfo, {
									file: file$1,
									url: url$1,
									content,
									frontmatter: content,
									headings: getHeadings$1(),
									rawContent: rawContent$1,
									compiledContent: compiledContent$1,
									'server:root': true,
									children: contentFragment
								});
				}
				Content$1[Symbol.for('astro.needsHeadRendering')] = false;

const _page4 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  frontmatter: frontmatter$1,
  file: file$1,
  url: url$1,
  rawContent: rawContent$1,
  compiledContent: compiledContent$1,
  getHeadings: getHeadings$1,
  getHeaders: getHeaders$1,
  Content: Content$1,
  default: Content$1
}, Symbol.toStringTag, { value: 'Module' }));

const html = "";

				const frontmatter = {"layout":"../../layouts/LayoutInfo.astro","title":"Salones Escom","description":"Lorem ipsum dolor sit, amet consectetur adipisicing elit. Possimus debitis culpa impedit quae quam? Corrupti.","link":"https://www.canva.com/design/DAFJcgRont8/view?embed","filepath":"/pdf/SALONES ESCOM.pdf","pubDate":"Jul 08 2022"};
				const file = "C:/Users/herna/Documents/Workspace/Astro/infografias/src/pages/blog/salones.md";
				const url = "/blog/salones";
				function rawContent() {
					return "";
				}
				function compiledContent() {
					return html;
				}
				function getHeadings() {
					return [];
				}
				function getHeaders() {
					console.warn('getHeaders() have been deprecated. Use getHeadings() function instead.');
					return getHeadings();
				}				async function Content() {
					const { layout, ...content } = frontmatter;
					content.file = file;
					content.url = url;
					content.astro = {};
					Object.defineProperty(content.astro, 'headings', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "headings" from your layout, try using "Astro.props.headings."')
						}
					});
					Object.defineProperty(content.astro, 'html', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "html" from your layout, try using "Astro.props.compiledContent()."')
						}
					});
					Object.defineProperty(content.astro, 'source', {
						get() {
							throw new Error('The "astro" property is no longer supported! To access "source" from your layout, try using "Astro.props.rawContent()."')
						}
					});
					const contentFragment = createVNode(Fragment, { 'set:html': html });
					return createVNode($$LayoutInfo, {
									file,
									url,
									content,
									frontmatter: content,
									headings: getHeadings(),
									rawContent,
									compiledContent,
									'server:root': true,
									children: contentFragment
								});
				}
				Content[Symbol.for('astro.needsHeadRendering')] = false;

const _page5 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  frontmatter,
  file,
  url,
  rawContent,
  compiledContent,
  getHeadings,
  getHeaders,
  Content,
  default: Content
}, Symbol.toStringTag, { value: 'Module' }));

const pageMap = new Map([['src/pages/index.astro', _page0],['src/pages/rss.xml.js', _page1],['src/pages/blog/titulacion.md', _page2],['src/pages/blog/electiva.md', _page3],['src/pages/blog/servicio.md', _page4],['src/pages/blog/salones.md', _page5],]);
const renderers = [Object.assign({"name":"astro:jsx","serverEntrypoint":"astro/jsx/server.js","jsxImportSource":"astro"}, { ssr: server_default }),];

if (typeof process !== "undefined") {
  if (process.argv.includes("--verbose")) ; else if (process.argv.includes("--silent")) ; else ;
}

const SCRIPT_EXTENSIONS = /* @__PURE__ */ new Set([".js", ".ts"]);
new RegExp(
  `\\.(${Array.from(SCRIPT_EXTENSIONS).map((s) => s.slice(1)).join("|")})($|\\?)`
);

const STYLE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".css",
  ".pcss",
  ".postcss",
  ".scss",
  ".sass",
  ".styl",
  ".stylus",
  ".less"
]);
new RegExp(
  `\\.(${Array.from(STYLE_EXTENSIONS).map((s) => s.slice(1)).join("|")})($|\\?)`
);

function getRouteGenerator(segments, addTrailingSlash) {
  const template = segments.map((segment) => {
    return segment[0].spread ? `/:${segment[0].content.slice(3)}(.*)?` : "/" + segment.map((part) => {
      if (part)
        return part.dynamic ? `:${part.content}` : part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
  }).join("");
  let trailing = "";
  if (addTrailingSlash === "always" && segments.length) {
    trailing = "/";
  }
  const toPath = compile(template + trailing);
  return toPath;
}

function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments
  };
}

function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push({
      ...serializedRoute,
      routeData: deserializeRouteData(serializedRoute.routeData)
    });
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  return {
    ...serializedManifest,
    assets,
    routes
  };
}

const _manifest = Object.assign(deserializeManifest({"adapterName":"@astrojs/netlify/functions","routes":[{"file":"","links":["assets/blog-electiva-blog-salones-blog-servicio-blog-titulacion-index-rss.ef99c506.css"],"scripts":[{"type":"external","value":"hoisted.2bd8e74f.js"}],"routeData":{"route":"/","type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":["assets/blog-electiva-blog-salones-blog-servicio-blog-titulacion-index-rss.ef99c506.css"],"scripts":[],"routeData":{"route":"/rss.xml","type":"endpoint","pattern":"^\\/rss\\.xml$","segments":[[{"content":"rss.xml","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/rss.xml.js","pathname":"/rss.xml","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":["assets/blog-electiva-blog-salones-blog-servicio-blog-titulacion-index-rss.ef99c506.css"],"scripts":[],"routeData":{"route":"/blog/titulacion","type":"page","pattern":"^\\/blog\\/titulacion\\/?$","segments":[[{"content":"blog","dynamic":false,"spread":false}],[{"content":"titulacion","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/blog/titulacion.md","pathname":"/blog/titulacion","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":["assets/blog-electiva-blog-salones-blog-servicio-blog-titulacion-index-rss.ef99c506.css"],"scripts":[],"routeData":{"route":"/blog/electiva","type":"page","pattern":"^\\/blog\\/electiva\\/?$","segments":[[{"content":"blog","dynamic":false,"spread":false}],[{"content":"electiva","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/blog/electiva.md","pathname":"/blog/electiva","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":["assets/blog-electiva-blog-salones-blog-servicio-blog-titulacion-index-rss.ef99c506.css"],"scripts":[],"routeData":{"route":"/blog/servicio","type":"page","pattern":"^\\/blog\\/servicio\\/?$","segments":[[{"content":"blog","dynamic":false,"spread":false}],[{"content":"servicio","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/blog/servicio.md","pathname":"/blog/servicio","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":["assets/blog-electiva-blog-salones-blog-servicio-blog-titulacion-index-rss.ef99c506.css"],"scripts":[],"routeData":{"route":"/blog/salones","type":"page","pattern":"^\\/blog\\/salones\\/?$","segments":[[{"content":"blog","dynamic":false,"spread":false}],[{"content":"salones","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/blog/salones.md","pathname":"/blog/salones","_meta":{"trailingSlash":"ignore"}}}],"base":"/","markdown":{"drafts":false,"syntaxHighlight":"shiki","shikiConfig":{"langs":[],"theme":"github-dark","wrap":false},"remarkPlugins":[],"rehypePlugins":[],"remarkRehype":{},"extendDefaultPlugins":false,"isAstroFlavoredMd":false},"pageMap":null,"renderers":[],"entryModules":{"\u0000@astrojs-ssr-virtual-entry":"entry.mjs","/astro/hoisted.js?q=0":"hoisted.2bd8e74f.js","astro:scripts/before-hydration.js":"data:text/javascript;charset=utf-8,//[no before-hydration script]"},"assets":["/assets/blog-electiva-blog-salones-blog-servicio-blog-titulacion-index-rss.ef99c506.css","/favicon.svg","/hoisted.2bd8e74f.js","/assets/foto.svg","/assets/image.svg","/assets/Title.svg","/pdf/ELECTIVA.pdf","/pdf/SALONES ESCOM.pdf","/pdf/SERVICIO SOCIAL.pdf","/pdf/TitulacionESCOM2009.pdf"]}), {
	pageMap: pageMap,
	renderers: renderers
});
const _args = {};

const _exports = adapter.createExports(_manifest, _args);
const handler = _exports['handler'];

const _start = 'start';
if(_start in adapter) {
	adapter[_start](_manifest, _args);
}

export { handler };
