chrome.runtime.onStartup.addListener(loadIcon)
chrome.runtime.onInstalled.addListener(loadIcon)

let manifestVersion = chrome.runtime.getManifest().manifest_version

function loadIcon() {
	chrome.storage.local.get({ userImage: null }, data => {
		if (data.userImage) {
			setIcon(data.userImage)
		}
	})

	//chrome.storage.local.remove("userImage")
}

function setIcon(imageData) {
	if (manifestVersion === 2) {
		chrome.browserAction.setIcon({ path: imageData })
	} else {
		chrome.action.setIcon({ path: imageData })
	}
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	switch (request.type) {
		case "userImage":
			getCurrentImage(sendResponse)
			return true

		case "setImage":
			setIconImage(request.imageData)
			return true
	}
})

function getCurrentImage(sendResponse) {
	chrome.storage.local.get({ userImage: null }, data => {
		sendResponse({ userImage: data.userImage })
	})
}

function setIconImage(imgData) {
	if (imgData && imgData.substring(0, 11) === "data:image/") {
		chrome.storage.local.set({ userImage: imgData })
		setIcon(imgData)
	}
}
