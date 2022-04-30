"use strict";

const iconSize = 16 * window.devicePixelRatio
const canvasSize = 100 * window.devicePixelRatio
let eCanvas
let eCtx
let editorMode = false
let pCanvas
let pCtx

window.addEventListener("DOMContentLoaded", () => {

	chrome.runtime.sendMessage({ type: "userImage" }, function(response) {
		if (response.userImage) {
			document.getElementById("userImage").src = response.userImage
		}
	})

	Array.from(document.getElementsByClassName("str")).forEach(ele => {
		ele.textContent = chrome.i18n.getMessage(ele.id)
	})

	document.getElementById("imagePicker").addEventListener("change", loadNewImageFile)
	document.getElementById("showEditor").addEventListener("click", showEditor)

	document.body.addEventListener("paste", handlePaste)

	document.body.addEventListener("dragenter", noEvent)
	document.body.addEventListener("dragover", noEvent)
	document.body.addEventListener("drop", handleDrop);
	Array("drag", "dragenter", "dragend", "dragleave", "drop").forEach(name => {
		document.body.addEventListener(name, visualDrag, true)
	})

	Array.from(document.querySelectorAll(".interactive")).forEach(ele => {
		ele.addEventListener("mousedown", setInteractiveOrigin.bind(ele))
		ele.addEventListener("mousemove", setInteractiveOrigin.bind(ele))
	})

});

function setInteractiveOrigin(e) {
	if (e.type === "mousemove" && e.which === 0 || !this.children[0]) { return }
	const rect = this.getBoundingClientRect()
	const oX = -(rect.width / 2 - (e.offsetX + 1)) / 2 // The 1 corrects for the border width or something
	const oY = -(rect.height / 2 - (e.offsetY + 1)) / 2
	this.children[0].style.setProperty("--targetPos", `${oX}px, ${oY}px`)
}

function handlePaste(event) {
	let items = (event.clipboardData || event.originalEvent.clipboardData).items;
	//console.log(JSON.stringify(items)); // will give you the mime types
	for (let index in items) {
		let item = items[index];
		if (item.kind === 'file') {
			let blob = item.getAsFile()
			loadThisUserImage(blob)
		}
	}
}

let visualOk = true
function visualDrag(e) {
	if (e.currentTarget !== document.body) { return }
	if (!visualOk) { return }
	if (e.type === "dragenter" || e.type === "drag") {
		if (!document.body.classList.contains("dragOver")) {
			document.body.classList.add("dragOver")
			visualOk = false
			setTimeout(() => { visualOk = true }, 16)
		}
	} else if (document.body.classList.contains("dragOver")) {
		document.body.classList.remove("dragOver")
	}
}

function noEvent(e) {
	e.stopPropagation()
	e.preventDefault()
}

function handleDrop(e) {
	noEvent(e)

	let dt = e.dataTransfer
	let file = dt.files[0]

	loadThisUserImage(file)
}

function loadNewImageFile(e) {
	const file = document.getElementById("imagePicker").files[0]

	loadThisUserImage(file)
}

function loadThisUserImage(file) {
	if (!file || file.type.substr(0, 6) !== "image/") {
		return
	}

	let fR = new FileReader()
	fR.onload = () => {
		let res = fR.result
		if (file.type === "image/svg") {
			res = patchUpSVG(res)
		}
		newUserImage(res)
	}
	fR.readAsDataURL(file)
}

function loadImage(src) {
	return new Promise((resolve, reject) => {
		var img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => reject(false)
		img.src = src
	})
}

function newUserImage(img) {
	loadImage(img).then(newImg => {
		const scaleInfo = getScaleInfo(newImg.width, newImg.height)

		if (editorMode) {
			newImage.img = newImg
			resetEditorImage(true)
			drawEditorCanvas()
		} else {
			const tmpC = document.createElement("canvas")
			tmpC.width = iconSize
			tmpC.height = iconSize
			const tmpCtx = tmpC.getContext("2d")
			tmpCtx.imageSmoothingQuality = "high"
			tmpCtx.drawImage(newImg, scaleInfo.x, scaleInfo.y, scaleInfo.w, scaleInfo.h)

			const imgData = tmpC.toDataURL()
			document.getElementById("userImage").src = imgData

			chrome.runtime.sendMessage({ type: "setImage", imageData: imgData })
		}
	})
}

function getScaleInfo(width, height, cover = true) {
	const aspW = width / iconSize
	const aspH = height / iconSize

	const wInfo = {
		w: width / aspW,
		h: height / aspW
	}
	const hInfo = {
		w: width / aspH,
		h: height / aspH
	}

	let scaleInfo = { x: 0, y: 0, w: iconSize, h: iconSize }

	const scaleMode = cover ? hInfo : wInfo

	if (!(aspW === aspH)) {
		//For cover use hInfo, for contain use wInfo
		if (scaleMode.w <= iconSize && scaleMode.h <= iconSize) {
			scaleInfo.w = Math.round(wInfo.w)
			scaleInfo.h = Math.round(wInfo.h)
		} else {
			scaleInfo.w = Math.round(hInfo.w)
			scaleInfo.h = Math.round(hInfo.h)
		}
	}

	scaleInfo.x = Math.round((iconSize - scaleInfo.w) / 2)
	scaleInfo.y = Math.round((iconSize - scaleInfo.h) / 2)

	return scaleInfo
}


// Only required for Firefox
const patchUpSVG = (svgData) => {
	// Firefox bug that causes svgs to fail silently
	//  https://bugzilla.mozilla.org/show_bug.cgi?id=700533
	// Solution that adds an explict size to the markup
	//  https://stackoverflow.com/a/61195034/329168
	// once the request returns, parse the response and get the SVG
	let parser = new DOMParser()
	let result = parser.parseFromString(svgData, 'text/xml')
	let inlineSVG = result.getElementsByTagName("svg")[0]

	// add the attributes Firefox needs. These should be absolute values, not relative
	inlineSVG.setAttribute('width', iconSize + 'px')
	inlineSVG.setAttribute('height', iconSize + 'px')
	//inlineSVG.setAttribute('preserveAspectRatio', "none"); //So we can stretch the svg for wide output

	// convert the SVG to a data uri
	let svg64 = btoa(new XMLSerializer().serializeToString(inlineSVG))
	let image64 = 'data:image/svg+xml;base64,' + svg64

	return image64
}

const newImage = {
	img: null,
	scale: 1,
	scaleMin: .1,
	scaleStep: .09,
	scaleSteps: 10,
	translate: { x: 0, y: 0 },
	tmpTranslate: { x: 0, y: 0 },
	mask: false
}

function showEditor() {
	editorMode = true

	if (!eCanvas) {
		eCanvas = document.getElementById("editorCanvas")
		eCanvas.width = canvasSize
		eCanvas.height = canvasSize
		eCtx = eCanvas.getContext("2d")
		eCtx.imageSmoothingQuality = "high"

		eCanvas.addEventListener("pointerdown", editorTranslate)
		eCanvas.addEventListener("pointerup", editorTranslate)
		eCanvas.addEventListener("pointermove", editorTranslate)

		eCanvas.addEventListener("wheel", editorScale)

		Array(
			["eImg", loadEditorImageFile],
			["eFit", toggleMenu.bind(document.getElementById("fitOverlay"))],
			["eMask", toggleMenu.bind(document.getElementById("maskOverlay"))],
			["eReset", resetEditorButton],
			["eOk", confirmEditorImage]
		).forEach(d => {
			document.getElementById(d[0]).addEventListener("click", d[1])
		})

		document.getElementById("fitMenu").addEventListener("click", setFitMode)

		document.getElementById("fitMenu").addEventListener("animationend", handleMenuAnimation)
		document.getElementById("fitOverlay").addEventListener("click", (e) => {
			e.stopPropagation()
			document.getElementById("fitOverlay").classList.add("hide")
		})


		document.getElementById("maskMenu").addEventListener("click", setMaskMode)

		document.getElementById("maskMenu").addEventListener("animationend", handleMenuAnimation)
		document.getElementById("maskOverlay").addEventListener("click", (e) => {
			e.stopPropagation()
			document.getElementById("maskOverlay").classList.add("hide")
		})


		document.getElementById("scaleBar").addEventListener("scroll", editorScale)

		pCanvas = document.getElementById("previewCanvas")
		pCanvas.width = iconSize
		pCanvas.height = iconSize
		pCtx = pCanvas.getContext("2d")

		// https://stackoverflow.com/a/7838871/329168
		CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
			if (w < 2 * r) r = w / 2;
			if (h < 2 * r) r = h / 2;
			this.beginPath();
			this.moveTo(x+r, y);
			this.arcTo(x+w, y,   x+w, y+h, r);
			this.arcTo(x+w, y+h, x,   y+h, r);
			this.arcTo(x,   y+h, x,   y,   r);
			this.arcTo(x,   y,   x+w, y,   r);
			this.closePath();
			return this;
		}
	}

	eCtx.clearRect(0, 0, canvasSize, canvasSize)

	resetEditorImage()

	document.body.classList.add("editing")
}

function handleMenuAnimation(e) {
	const ele = e.target.parentNode
	if (ele.classList.contains("show")) {
		ele.classList.remove("show")
	}
	if (ele.classList.contains("hide")) {
		ele.classList.remove("hide")
		ele.style.display = "none"
	}
}

function loadEditorImageFile(e) {
	document.getElementById("imagePicker").click()
}

function resetEditorImage(keepImage = false) {
	if (!keepImage) { newImage.img = null }

	newImage.scale = 1
	newImage.translate = { x: 0, y: 0 }
	newImage.tmpTranslate = { x: 0, y: 0 }

	setMaskMode(null, true)

	newImage.scaleSteps = 0
	if (newImage.img) {
		setScaleInfo()
	}
	document.getElementById("scaleBar").scrollTo(0, 0)
}

function setScaleInfo(scaleInfo = null, cover = true) {

	if (!scaleInfo) {
		scaleInfo = getScaleInfo(newImage.img.width, newImage.img.height, cover)
	}

	if (newImage.img.width > iconSize && newImage.img.height > iconSize) {
		newImage.scaleMin = scaleInfo.h / newImage.img.height
		newImage.scaleSteps = Math.ceil((newImage.img.height - scaleInfo.h) / 10)
		newImage.scaleStep = (1 - newImage.scaleMin) / newImage.scaleSteps
	} else {
		newImage.scaleMin = 1
		newImage.scaleStep = 0
		newImage.scaleSteps = 0
	}

	document.getElementById("scaleBar").children[0].style.width = (newImage.scaleSteps === 0 ? 0 : 100 + (newImage.scaleSteps * 10)) + "px"
}

const downPos = { x: 0, y: 0 }
let isDown = false
function editorTranslate(e) {
	switch (e.type) {
		case "pointerdown":
			eCanvas.setPointerCapture(e.pointerId)
			downPos.x = e.layerX
			downPos.y = e.layerY
			newImage.tmpTranslate = { x: 0, y: 0 }
			isDown = true
			break

		case "pointerup":
			eCanvas.releasePointerCapture(e.pointerId)
			newImage.translate = {
				x: newImage.translate.x + newImage.tmpTranslate.x,
				y: newImage.translate.y + newImage.tmpTranslate.y,
			}
			newImage.tmpTranslate = { x: 0, y: 0 }
			downPos.x = 0
			downPos.y = 0
			isDown = false
			break

		case "pointermove":
			if (!isDown) { break }
			newImage.tmpTranslate = {
				x: e.layerX - downPos.x,
				y: e.layerY - downPos.y
			}
			drawEditorCanvas()
	}
}

function editorScale(e) {
	e.preventDefault()

	if (!newImage.img) { return }

	const oldScale = newImage.scale

	if (e.type === "wheel") {
		//newImage.scale += e.deltaY > 0 ? -newImage.scaleStep : newImage.scaleStep
		const scaleBar = document.getElementById("scaleBar")
		scaleBar.scrollTo(scaleBar.scrollLeft + (e.deltaY > 0 ? 10 : -10), 0)
	} else if (e.type === "scroll") {
		newImage.scale = newImage.scaleStep * Math.round(((newImage.scaleSteps * 10) - e.target.scrollLeft) / 10) + newImage.scaleMin
	}

	newImage.scale = Math.min(Math.max(newImage.scaleMin, newImage.scale), 1)

	if (oldScale !== newImage.scale) {
		drawEditorCanvas()
	}
}

function drawEditorCanvas() {
	if (!eCtx || !newImage.img) { return }

	const hCanvas = canvasSize / 2
	const imgW = newImage.img.width * newImage.scale
	const imgH = newImage.img.height * newImage.scale

	eCtx.clearRect(0, 0, canvasSize, canvasSize)

	eCtx.drawImage(
		newImage.img,
		hCanvas - (imgW / 2) + newImage.translate.x + newImage.tmpTranslate.x,
		hCanvas - (imgH / 2) + newImage.translate.y + newImage.tmpTranslate.y,
		imgW,
		imgH
	)

	pCtx.clearRect(0, 0, iconSize, iconSize)
	pCtx.drawImage(eCanvas, (canvasSize - iconSize) / 2, (canvasSize - iconSize) / 2, iconSize, iconSize, 0, 0, iconSize, iconSize)
}

function toggleMenu(e) {
	if (!newImage.img) { return }
	const overlay = this
	overlay.classList.toggle("show")
	overlay.style.display = overlay.classList.contains("show") ? "block" : "none"
	const menu = overlay.children[0]
	menu.style.left = e.pageX + "px"
	menu.style.top =
		Math.min(
			overlay.offsetHeight - menu.offsetHeight - 5,
			Math.max(
				5, 
				e.pageY - (menu.offsetHeight / 2)
			)
		) + "px"
}

const validFitModes = ["cover", "contain", "full"]
function setFitMode(e) {
	const selectedMode = e.target?.getAttribute("data-value")
	if (!validFitModes.includes(selectedMode)) { return }

	switch (selectedMode) {
		case "cover":
		case "contain":
			let scaleInfo = getScaleInfo(newImage.img.width, newImage.img.height, selectedMode === "cover")
			newImage.scale = scaleInfo.h / newImage.img.height
			setScaleInfo(scaleInfo)
			break

		case "full":
			newImage.scale = 1
	}

	document.getElementById("scaleBar").scrollTo(newImage.scaleSteps * 10, 0)

	newImage.translate = { x: 0, y: 0 }

	drawEditorCanvas()
}

const validMaskModes = ["none", "circle", "rounded"]
function setMaskMode(e, remove = false) {
	let selectedMode

	if (remove) {
		selectedMode = "none"
	} else {
		selectedMode = e.target?.getAttribute("data-value")
	}
	if (!validMaskModes.includes(selectedMode)) { return }

	newImage.mask = (selectedMode === "none") ? false : selectedMode

	pCtx.clearRect(0, 0, canvasSize, canvasSize)

	pCtx.restore()
	pCtx.save()

	if (newImage.mask === "circle") {
		pCtx.beginPath()
		pCtx.arc(iconSize / 2, iconSize / 2, iconSize / 2, 0, Math.PI * 2)
		pCtx.clip()
	} else if (newImage.mask === "rounded") {
		pCtx.roundRect(0, 0, iconSize, iconSize, 5)
		pCtx.clip()
	}

	drawEditorCanvas()
}

function resetEditorButton() {
	resetEditorImage(true)

	drawEditorCanvas()
}

function confirmEditorImage() {
	const imgData = pCanvas.toDataURL()
	document.getElementById("userImage").src = imgData

	chrome.runtime.sendMessage({ type: "setImage", imageData: imgData })	
}
