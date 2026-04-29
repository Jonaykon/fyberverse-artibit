// strip "var(--...)" syntax and get color value
function getCSSColor(value) {
    if (typeof value !== 'string') return null;
    const varMatch = value.match(/var\((--[^)]+)\)/);
    if (varMatch) {
        const varName = varMatch[1].trim();
        return getCSSVar(varName, 'string');
    }
    return value;
}

// convert hex code to rgba
function hex2rgba(hex, { r = null, g = null, b = null, a = null } = {}) {
    let digits = hex.substring(1);
    if (!/^([A-Fa-f0-9]{3,4}){1,2}$/.test(digits)) {
        throw new Error('Bad Hex');
    }
    let expanded = digits;
    if (digits.length === 3) {
        expanded = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2];
    } else if (digits.length === 4) {
        expanded = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2] + digits[3] + digits[3];
    }
    let num = parseInt('0x' + expanded, 16);
    let r0, g0, b0, a0;
    if (expanded.length === 6) {
        r0 = (num >> 16) & 255;
        g0 = (num >> 8) & 255;
        b0 = num & 255;
        a0 = null;
    } else { // 8
        r0 = (num >> 24) & 255;
        g0 = (num >> 16) & 255;
        b0 = (num >> 8) & 255;
        a0 = num & 255;
    }
    let finalR = r !== null ? r : r0;
    let finalG = g !== null ? g : g0;
    let finalB = b !== null ? b : b0;
    let finalA = a !== null ? a : (a0 !== null ? a0 / 255 : 1);
    return `rgba(${finalR}, ${finalG}, ${finalB}, ${finalA})`;
}

/* setCSSVar('--menu-radius', 50); */
/* setCSSVar('--ring-rotation-duration', 20); */

// keep image in consistent size and aspect ratio
function drawImageCentered(ctx, img, x, y, maxSize) {
    if (!img) return;
    const ratio = img.width / img.height;

    let w, h;
    if (ratio > 1) {
        // wider than tall
        w = Math.min(img.width, maxSize);
        h = w / ratio;
    } else {
        // taller than wide
        h = Math.min(img.height, maxSize);
        w = h * ratio;
    }

    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
}

// draw ellipse
function drawEllipse(ctx, x, y, w, h) {
    let kappa = .5522848,
        ox = (w / 2) * kappa, // control point offset horizontal
        oy = (h / 2) * kappa, // control point offset vertical
        xe = x + w,           // x-end
        ye = y + h,           // y-end
        xm = x + w / 2,       // x-middle
        ym = y + h / 2;       // y-middle

    ctx.beginPath();
    ctx.moveTo(x, ym);
    ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
    ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
    //ctx.closePath(); // not used correctly, see comments (use to close off open path)
    ctx.stroke();
}



const canvas = document.getElementById('mainMenu');
const ctx = canvas.getContext('2d');

canvas.addEventListener('contextmenu', (e) => e.preventDefault());



let canvasMenuNodes = [];
let orbitGroups = [];
let hoveredNode = null;
let isCanvasMenuReady = false;
let animationFrameId;
let canvasInitTime = null;
let imageAssets = {};
let orbitSets = {};

function getOrbitConfig(orbit) {
    return orbitData.find(o => o.orbit === orbit) || {};
}

function getBaseRadius() {
    return getCSSVar('--menu-radius', 'int') || 180;
}

function getRingDuration() {
    return getCSSVar('--ring-rotation-duration', 'float') || 60;
}

function getNodeSize() {
    return getCSSVar('--button-size', 'int') || 100;
}

// get cached image by path
function getCachedImage(path) {
    return imageAssets[path] || null;
}

// preloadImages(['path/to/logo.png', 'path/to/background.jpg']);
// preloadImages([{path: 'logo.png', id: 'logo'}, {path: 'bg.jpg', id: 'bg'}]);
function preloadImages(imageList) {
    if (!Array.isArray(imageList)) return Promise.resolve();

    return Promise.all(
        imageList.map(item => {
            const path = typeof item === 'string' ? item : item.path;
            if (imageAssets[path]) return Promise.resolve();

            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    imageAssets[path] = img;
                    resolve();
                };
                img.onerror = resolve;
                img.src = path;
            });
        })
    );
}

const starCount = Math.min(Math.floor(window.innerHeight / 5), 100);
let stars;
function resizeCanvas(density) {
    if (!canvas || !ctx) return;

    const dpr = (density || 1) * window.devicePixelRatio || 1;
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (density) return;
    buildCanvasMenuData();

    // starfield background
    if (!SIMPLE_MODE) {
        stars = [];
        const width = window.innerWidth;
        const height = window.innerHeight;
        for (let i = 0; i < starCount; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 3.5;
            const opacity = Math.random() * 0.5 + 0.5;
            const color = (Math.random() < 0.5 ? getCSSVar('--star-bg') : getCSSVar('--star-bg-2')) || 'rgba(0, 0, 0, 0)';
            const twinklePhase = Math.random() * 20;
            const parallaxFactor = 0.05 + Math.random() * 0.1;
            stars.push({ x, y, size, opacity, color, twinklePhase, parallaxFactor });
        }
    }
}

function screenToCanvas(x, y) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: x - rect.left,
        y: y - rect.top,
    };
}




let isDragging = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
const CAMERA_SNAP_SPEED = 0.25;
const CAMERA_SNAP_SPEED_SLOWED = 0.04;
let cameraSnapSpeed = CAMERA_SNAP_SPEED;
function enableCameraControl() {
    el = canvas;
    if (SIMPLE_MODE) return;

    // begin drag
    function beginDrag(clientX, clientY) {
        isDragging = true;
        startX = clientX - currentX;
        startY = clientY - currentY;
        el.style.cursor = 'grab';
        cameraSnapSpeed = CAMERA_SNAP_SPEED;
    }

    // move during drag
    let lastDrag = 0;
    function dragTo(clientX, clientY) {
        const now = performance.now();
        if (now - lastDrag < 16) return;
        lastDrag = now;
        if (!isDragging) return;
        currentX = clientX - startX;
        currentY = clientY - startY;
    }

    // end drag
    function endDrag() {
        isDragging = false;
        el.style.cursor = 'default';
        if (currentX * currentY != 0) setButtonViz(centerBtn, true);
    }

    // mouse events
    el.addEventListener('mousedown', (e) => { beginDrag(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => { dragTo(e.clientX, e.clientY); });
    window.addEventListener('mouseup', endDrag);

    // touch events
    el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        beginDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        dragTo(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchend', endDrag);

    // trackpad events
    el.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (Math.abs(e.deltaX) < 100 && Math.abs(e.deltaY) < 100) {
            currentX -= e.deltaX * 1.5;
            currentY -= e.deltaY * 1.5;
            setElTransform(el, currentX, currentY, null, offsetMainMenu);
        }
    }, { passive: false });
}

function snapCameraToCenter() {
    currentX = 0;
    currentY = 0;
    setButtonViz(centerBtn, false);
    cameraSnapSpeed = CAMERA_SNAP_SPEED_SLOWED;
}
centerBtn?.addEventListener('click', () => {
    snapCameraToCenter();
});




function buildCanvasMenuData() {
    // preload images
    const menuImagePaths = canvasMenuNodes
        .filter(node => node.menu.image)
        .map(node => `${node.menu.image}`);

    if (mainMenuLogo) menuImagePaths.push(mainMenuLogo);
    preloadImages(menuImagePaths);


    if (!Array.isArray(menuItems) || !Array.isArray(orbitData)) return;

    const menus = SIMPLE_MODE ? menuItems.filter(m => m.menuId === 'logoHitbox') : menuItems;

    const groups = new Map();
    menus.forEach(menu => {
        if (menu.hidden) return;

        const orbit = menu.orbit;
        const oConfig = getOrbitConfig(orbit);

        const layer = oConfig?.orbitNum ? oConfig.orbitNum : orbit;

        let group = groups.get(orbit);
        if (!group) {
            group = {
                orbit,
                layer: oConfig?.orbitNum || orbit,
                phase: orbitSets[orbit + 'phase'] || (orbitSets[orbit + 'phase'] = Math.random() * Math.PI * 2),
                direction: oConfig?.direction || (layer % 2 === 0 ? -1 : 1),
                scaleX: oConfig?.scaleX || getCSSVar('--menu-orbit-scale-x') * getCSSVar('--menu-stage-scale') || 1,
                scaleY: oConfig?.scaleY || getCSSVar('--menu-orbit-scale-y') * getCSSVar('--menu-stage-scale') || 1,
                offsetX: oConfig?.offsetX || 0,
                offsetY: oConfig?.offsetY || 0,
                centerMenuId: oConfig?.center || null,
                items: [],
            };
            groups.set(orbit, group);
        }

        group.items.push({ menu });
    });

    orbitGroups = Array.from(groups.values()).sort((a, b) => a.layer - b.layer);

    canvasMenuNodes = [];

    orbitGroups.forEach(group => {
        const count = group.items.length;
        const layer = group.layer;
        const orbitRadius = layer === 0 ? 0 : (getBaseRadius() * layer * 1.2 + 60);

        group.items.forEach((entry, index) => {
            const baseAngle = (index / Math.max(1, count)) * Math.PI * 2;
            const menu = entry.menu;
            const size = Math.max(20, (menu.scale || 1) * getNodeSize() / 2) * getCSSVar('--menu-stage-scale');
            const sizeTrue = size;

            canvasMenuNodes.push({
                menu,
                group,
                baseAngle,
                orbitRadius,
                size,
                sizeTrue,
                x: 0,
                y: 0,
                glowRadius: size + 30,
                glowOpacity: 0,
            });
        });
    });
}



let centerX = 0;
let centerY = 0;
let cursorX = 0;
let cursorY = 0;
let logoHover = 0;
function drawCanvasMenu(t) {
    if (!isCanvasMenuReady || !ctx) return;

    if (!canvasInitTime) canvasInitTime = t;
    const sec = (t - canvasInitTime) / 1000;

    // first frame
    if (sec == 0) {
        centerX = window.innerWidth / 2;
        centerY = window.innerHeight / 2;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerXT = width / 2 + currentX;
    const centerYT = height / 2 + currentY;
    centerX += (centerXT - centerX) * cameraSnapSpeed;
    centerY += (centerYT - centerY) * cameraSnapSpeed;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getCSSVar('--bg') || '#000000';
    ctx.fillRect(0, 0, width, height);

    // draw stars
    stars?.forEach(star => {
        const offsetX = (centerX - width / 2) * star.parallaxFactor;
        const offsetY = (centerY - height / 2) * star.parallaxFactor;
        const x = ((star.x + offsetX) % width + width) % width;
        const y = ((star.y + offsetY) % height + height) % height;
        const radius = Math.max(Math.cos((sec + star.twinklePhase) / 2) + 0.5, 0) * star.size;
        const glowRadius = radius * 10;

        ctx.globalAlpha = star.opacity;

        ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
        const color = star.color;
        glow.addColorStop(0, hex2rgba(color, { a: 0.1 }));
        glow.addColorStop(1, hex2rgba(color, { a: 0 }));
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // draw semi-transparent background ring geometry
    orbitGroups.forEach(group => {
        const layer = group.layer;

        if (layer === 0) return;

        const orbitRadius = getBaseRadius() * layer * 1.2 + 60;
        let originX = centerX;
        let originY = centerY;

        if (group.centerMenuId) {
            const centerNode = canvasMenuNodes.find(n => n.menu.menuId === group.centerMenuId);
            if (centerNode) {
                originX = centerNode.x;
                originY = centerNode.y;
            }
        }

        ctx.beginPath();
        ctx.strokeStyle = hex2rgba(getCSSVar('--ring'), { a: 0.5 });
        ctx.lineWidth = Math.max(Math.cos(sec * 3 + layer) * 1.5 + 2, 0.5);
        drawEllipse(ctx, originX - orbitRadius * group.scaleX, originY - orbitRadius * group.scaleY, orbitRadius * 2 * group.scaleX, orbitRadius * 2 * group.scaleY);
    });

    let logoIsHover = false;

    // compute positions and draw nodes
    canvasMenuNodes.forEach(node => {
        const group = node.group;
        const layer = group.layer;
        const duration = getRingDuration() * Math.max(1, layer);
        const direction = group.direction;

        const omega = layer === 0 ? 0 : ((2 * Math.PI) / duration) * direction;
        const angle = node.baseAngle + (omega * sec) + group.phase;

        const ringRadius = layer === 0 ? 0 : (getBaseRadius() * layer * 1.2 + 60);

        const offsetX = group.offsetX || 0;
        const offsetY = group.offsetY || 0;

        let originX = centerX + offsetX;
        let originY = centerY + offsetY;

        if (group.centerMenuId && layer !== 0) {
            const centerNode = canvasMenuNodes.find(n => n.menu.menuId === group.centerMenuId);
            if (centerNode) {
                originX = centerNode.x;
                originY = centerNode.y;
            }
        }

        const x = originX + Math.cos(angle) * ringRadius * group.scaleX;
        const y = originY + Math.sin(angle) * ringRadius * group.scaleY;
        node.x = x;
        node.y = y;
        const safeMargin = 1.5 * node.size;
        if (x < -safeMargin || x > width + safeMargin || y < -safeMargin || y > height + safeMargin) return;

        const isHovered = hoveredNode === node;
        logoIsHover = logoIsHover || !menuIsOpen && isHovered && node.menu.menuId === 'logoHitbox';

        const color = getCSSColor(node.menu.color) || '#00000000';

        // node shadow glow / border
        ctx.beginPath();

        const glowRadius = isHovered ? node.size + 50 : node.size + 20;
        const glowOpacity = isHovered ? 0.8 : 0.5;

        node.glowRadiusT = glowRadius;
        node.glowRadius += (node.glowRadiusT - node.glowRadius) * 0.2;
        node.glowOpacityT = glowOpacity;
        node.glowOpacity += (node.glowOpacityT - node.glowOpacity) * 0.2;

        ctx.arc(x, y, node.glowRadius, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, node.glowRadius);
        glow.addColorStop(0, hex2rgba(color, { a: color == '#00000000' ? 0 : node.glowOpacity }));
        glow.addColorStop(1, hex2rgba(color, { a: 0 }));
        ctx.fillStyle = glow;
        ctx.fill();

        function calculateNodeScale() {
            const maxDist = 300;

            let zoom = 1;

            const dx = cursorX - x;
            const dy = cursorY - y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            zoom = 1 + Math.max(0, (1 - dist / maxDist)) * 0.375;
            return zoom;
        }
        node.sizeT = calculateNodeScale() * node.sizeTrue;
        node.size += (node.sizeT - node.size) * 0.1;

        // node circle
        ctx.beginPath();
        ctx.arc(x, y, node.size, 0, Math.PI * 2);
        ctx.fillStyle = getCSSColor(node.menu.color) || '#00000000';
        ctx.fill();

        // node stroke
        ctx.strokeStyle = hex2rgba(color, { a: color == '#00000000' ? 0 : node.glowOpacity - 0.4 });
        ctx.lineWidth = node.glowRadius * 0.05;
        ctx.stroke();

        // node label
        if (node.menu.showTitle) {
            const textSize = node.size / getNodeSize();
            ctx.font = `${28 * textSize}px Main, Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'white';
            const label = node.menu.title || node.menu.menuId;
            const shortLabel = label.length > 16 ? label.slice(0, 16) + '...' : label;
            ctx.fillText(shortLabel, x, y + 130 * textSize);
        }

        // node icon
        const path = `${node.menu.image}`;
        if (node.menu.image && getCachedImage(path)) {
            const img = getCachedImage(path);
            const maxSize = node.size * 2 * (node.menu.imageScale || 1);
            drawImageCentered(ctx, img, x, y, maxSize);
        }
    });

    // logo
    const color = getCSSVar('--logo-glow') || '#00000000';
    const logoHoverT = logoIsHover ? 1 : 0;
    logoHover += (logoHoverT - logoHover) * 0.1;
    ctx.arc(centerX, centerY, 150, 0, Math.PI * 2);
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 150);
    glow.addColorStop(0, hex2rgba(color, { a: logoHover * 0.3 }));
    glow.addColorStop(1, hex2rgba(color, { a: 0 }));
    ctx.fillStyle = glow;
    ctx.fill();

    drawImageCentered(ctx, imageAssets[mainMenuLogo], centerX, centerY, 200 * getCSSVar('--menu-stage-scale') + logoHover * 20);

    // text
    const textOffset = mainMenuLogo ? MAIN_MENU_TEXT_OFFSET_Y + (logoHover * 10) : 0;
    ctx.globalAlpha = Math.cos(sec * 3) * 0.25 + 0.75;
    ctx.fillStyle = getCSSVar('--white');
    ctx.font = `${16 * getCSSVar('--menu-stage-scale')}px Main, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(MAIN_MENU_TITLE, centerX, centerY + textOffset * getCSSVar('--menu-stage-scale'));
    ctx.globalAlpha = Math.cos((sec + 0.4) * 3) * 0.25 + 0.75;
    ctx.fillStyle = getCSSVar('--info-text-color');
    ctx.font = `${12 * getCSSVar('--menu-stage-scale')}px Main, Arial, sans-serif`;
    ctx.fillText(MAIN_MENU_SUBTITLE, centerX, centerY + (textOffset + 20) * getCSSVar('--menu-stage-scale'));
    ctx.globalAlpha = 1;

    animationFrameId = window.requestAnimationFrame(drawCanvasMenu);
}

enableCameraControl();



function getNodeAtPoint(x, y) {
    return canvasMenuNodes.find(node => {
        const dx = node.x - x;
        const dy = node.y - y;
        return Math.sqrt(dx * dx + dy * dy) <= node.size + 4;
    });
}

function handlePointerMove(e) {
    if (menuIsOpen) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    cursorX = pos.x;
    cursorY = pos.y;
    const node = getNodeAtPoint(pos.x, pos.y);
    if (node !== hoveredNode) {
        hoveredNode = node;
        canvas.style.cursor = node ? 'pointer' : 'default';
    }
}

function handlePointerDown(e) {
    if (menuIsOpen) return;
    if (!hoveredNode) return;
    const menuId = hoveredNode.menu.menuId;
    if (!menuId) return;
    if (menuId === 'logoHitbox') {
        openLogo();
        return;
    }
    openMainMenu(menuId);
}

function canvasInitMainMenu() {
    if (!canvas || !ctx) return;

    isCanvasMenuReady = true;

    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.zIndex = '8';
    canvas.classList.remove('hidden');

    resizeCanvas();

    buildCanvasMenuData();

    window.addEventListener('resize', () => resizeCanvas());
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('touchstart', (e) => hoveredNode = null);
    canvas.addEventListener('touchmove', (e) => handlePointerMove(e.touches[0]));
    canvas.addEventListener('touchend', (e) => handlePointerDown(e.touches[0]));
    /* canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            const touch = e.touches[0]; const p = screenToCanvas(touch.clientX, touch.clientY); const node = getNodeAtPoint(p.x, p.y); if (node) openMenuById(node.menu.menuId);
        }
    }); */

    if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
    animationFrameId = window.requestAnimationFrame(drawCanvasMenu);

    if (typeof mainMenu !== 'undefined' && mainMenu) {
        mainMenu.style.opacity = 1;
    }
}

let menuIsOpen = false;
function openMainMenu(menuId) {
    hoveredNode = null;
    cursorX = null;
    cursorY = null;
    openMenuById(menuId);
    menuIsOpen = true;
    resizeCanvas(0.25);
}

window.initMainMenu = canvasInitMainMenu;

if (document.readyState === 'complete') {
    canvasInitMainMenu();
} else {
    window.addEventListener('load', canvasInitMainMenu);
}