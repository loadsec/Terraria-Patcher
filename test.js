console.log("==== START ====");
console.log("process.versions.electron:", process.versions.electron);
console.log("process.type:", process.type);
const e = require("electron");
console.log("require('electron') return type:", typeof e);
if (typeof e === "object") {
  console.log("Keys:", Object.keys(e));
} else {
  console.log("Value:", e);
}
console.log("==== END ====");
process.exit(0);
