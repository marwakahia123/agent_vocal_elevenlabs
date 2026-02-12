import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  // Determine the base URL
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host") || "hallcall.fr";
  const baseUrl = `${proto}://${host}`;

  const script = generateEmbedScript(agentId, baseUrl);

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function generateEmbedScript(agentId: string, baseUrl: string): string {
  // Sanitize agentId for use as JS variable suffix
  const safeId = agentId.replace(/[^a-zA-Z0-9_]/g, "_");

  return `(function() {
  "use strict";
  if (window.__hallcall_init_${safeId}) return;
  window.__hallcall_init_${safeId} = true;

  var AGENT_ID = "${agentId}";
  var BASE_URL = "${baseUrl}";
  var CONFIG_URL = BASE_URL + "/api/widgets/config/" + AGENT_ID;
  var WIDGET_URL = BASE_URL + "/widget/" + AGENT_ID;

  var config = {
    position: "bottom-right",
    avatarType: "orb",
    avatarColor1: "#4f524c",
    avatarColor2: "#F5CABB",
    avatarImageUrl: "",
    callToAction: "Besoin d'aide ?",
    borderRadius: 16,
    buttonRadius: 50,
    borderColor: "#E2E8F0"
  };

  var el = document.querySelector('hallcall[agent-id="' + AGENT_ID + '"]');
  if (!el) {
    console.warn("[HallCall] No <hallcall agent-id=\\"" + AGENT_ID + "\\"> element found");
    return;
  }

  var isOpen = false;
  var button = null;
  var container = null;

  // Inject keyframes for animations
  var style = document.createElement("style");
  style.textContent = [
    "@keyframes hc-float-${safeId}{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}",
    "@keyframes hc-glow-${safeId}{0%,100%{box-shadow:0 4px 24px rgba(0,0,0,0.15),0 0 20px var(--hc-glow)}50%{box-shadow:0 4px 24px rgba(0,0,0,0.15),0 0 40px var(--hc-glow),0 0 60px var(--hc-glow2)}}",
    "@keyframes hc-ripple-${safeId}{0%{transform:scale(0.8);opacity:0.6}100%{transform:scale(2.5);opacity:0}}",
    "@keyframes hc-spin-grad-${safeId}{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}"
  ].join("");
  document.head.appendChild(style);

  fetch(CONFIG_URL)
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(d) {
      if (d && d.config) {
        for (var k in d.config) { config[k] = d.config[k]; }
      }
      render();
    })
    .catch(function() { render(); });

  function render() {
    var pos = config.position === "bottom-left" ? "left:20px;" : "right:20px;";
    var grad = "linear-gradient(135deg," + config.avatarColor1 + "," + config.avatarColor2 + ")";
    var c1 = config.avatarColor1;
    var c2 = config.avatarColor2;

    // Outer wrapper for float animation (so hover/ripple don't conflict)
    var wrapper = document.createElement("div");
    wrapper.style.cssText = "position:fixed;bottom:20px;" + pos +
      "z-index:2147483646;animation:hc-float-${safeId} 3s ease-in-out infinite;";

    // Button
    button = document.createElement("div");
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", config.callToAction);
    button.setAttribute("tabindex", "0");
    button.style.cssText = "position:relative;width:64px;height:64px;border-radius:" + config.buttonRadius + "%;" +
      "cursor:pointer;display:flex;align-items:center;justify-content:center;" +
      "transition:transform 0.2s;overflow:visible;" +
      "--hc-glow:" + c2 + "55;--hc-glow2:" + c2 + "33;" +
      "animation:hc-glow-${safeId} 2.5s ease-in-out infinite;";

    // Spinning gradient border ring
    var ring = document.createElement("div");
    ring.style.cssText = "position:absolute;inset:-3px;border-radius:" + config.buttonRadius + "%;" +
      "background:conic-gradient(from 0deg," + c1 + "," + c2 + ",transparent," + c1 + ");" +
      "animation:hc-spin-grad-${safeId} 4s linear infinite;z-index:0;";
    button.appendChild(ring);

    // Inner circle - adapts to avatarType
    var hasImage = (config.avatarType === "image" || config.avatarType === "link") && config.avatarImageUrl;
    var inner = document.createElement("div");
    inner.style.cssText = "position:absolute;inset:3px;border-radius:" + config.buttonRadius + "%;" +
      "background:" + (hasImage ? "transparent" : grad) + ";z-index:1;display:flex;align-items:center;justify-content:center;overflow:hidden;";

    if (hasImage) {
      var img = document.createElement("img");
      img.src = config.avatarImageUrl;
      img.alt = "Avatar";
      img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:" + config.buttonRadius + "%;";
      inner.appendChild(img);
      var overlay = document.createElement("div");
      overlay.style.cssText = "position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:rgba(0,0,0,0.2);border-radius:" + config.buttonRadius + "%;";
      overlay.innerHTML = phoneSvg();
      inner.appendChild(overlay);
    } else {
      inner.innerHTML = phoneSvg();
    }
    button.appendChild(inner);

    button.onmouseenter = function() { button.style.transform = "scale(1.1)"; };
    button.onmouseleave = function() { button.style.transform = "scale(1)"; };
    button.onclick = function() { ripple(); toggle(); };
    button.onkeydown = function(e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ripple(); toggle(); }
    };

    wrapper.appendChild(button);
    document.body.appendChild(wrapper);

    // Ripple effect
    function ripple() {
      var r = document.createElement("div");
      r.style.cssText = "position:absolute;top:0;left:0;width:64px;height:64px;border-radius:50%;" +
        "border:2px solid " + c2 + ";pointer-events:none;z-index:0;" +
        "animation:hc-ripple-${safeId} 0.6s ease-out forwards;";
      button.appendChild(r);
      setTimeout(function() { r.remove(); }, 700);
    }

    // iframe container
    container = document.createElement("div");
    container.style.cssText = "position:fixed;bottom:100px;" + pos +
      "width:380px;height:600px;max-height:calc(100vh - 120px);max-width:calc(100vw - 40px);" +
      "z-index:2147483646;border-radius:" + config.borderRadius + "px;overflow:hidden;" +
      "box-shadow:0 8px 40px rgba(0,0,0,0.2);display:none;opacity:0;" +
      "transform:translateY(10px) scale(0.95);transition:opacity 0.25s ease,transform 0.25s ease;";

    var iframe = document.createElement("iframe");
    iframe.src = WIDGET_URL;
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.setAttribute("allow", "microphone; autoplay");
    iframe.setAttribute("title", "HallCall Voice Assistant");
    container.appendChild(iframe);
    document.body.appendChild(container);
  }

  function toggle() {
    isOpen = !isOpen;
    var inner = button.querySelector("div:nth-child(2)");
    var hasImg = (config.avatarType === "image" || config.avatarType === "link") && config.avatarImageUrl;
    var svg = isOpen ? closeSvg() : phoneSvg();
    if (hasImg && inner) {
      var overlay = inner.querySelector("div");
      if (overlay) overlay.innerHTML = svg;
    } else if (inner) {
      inner.innerHTML = svg;
    }
    if (isOpen) {
      container.style.display = "block";
      container.offsetHeight;
      container.style.opacity = "1";
      container.style.transform = "translateY(0) scale(1)";
    } else {
      container.style.opacity = "0";
      container.style.transform = "translateY(10px) scale(0.95)";
      setTimeout(function() { if (!isOpen) container.style.display = "none"; }, 250);
    }
  }

  function phoneSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  }

  function closeSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  }
})();`;
}
