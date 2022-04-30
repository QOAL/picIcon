var AdmZip = require("adm-zip")
var manifestJson = require("../manifest.json")

console.log(`Creating web extension archive for ${manifestJson.version}`)

var zip = new AdmZip()

zip.addLocalFolder("_locales", "_locales")
zip.addLocalFolder("icons", "icons")
zip.addLocalFolder("popup", "popup")
zip.addLocalFolder("background", "background")

zip.addLocalFile("manifest.json")

zip.writeZip(`build/picIcon_${manifestJson.version.replace(/\./g,"-")}.zip`)

console.log(`...Done!`)
