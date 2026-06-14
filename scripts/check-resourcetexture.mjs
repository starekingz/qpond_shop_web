import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// ResourceTexture class
const entry = zip.getEntry("net/minecraft/class_1049.class");
if (!entry) { console.log("NOT FOUND"); process.exit(1); }

const data = entry.getData();
// Parse constant pool to find superclass
// Simple approach: look for the class name strings
const text = data.toString("latin1");

// Find superclass name by looking for extends pattern in constant pool
// In Java bytecode, the superclass index is in the class file header
// Let's use a simple regex to find class references
const classRefs = [...text.matchAll(/net\/minecraft\/client\/texture\/[A-Za-z0-9_]+/g)].map(m => m[0]);
console.log("Class references in ResourceTexture:");
[...new Set(classRefs)].forEach(c => console.log("  " + c));

// Also look for TextureContents
const contentRefs = [...text.matchAll(/[A-Za-z0-9_]*[Cc]ontents[A-Za-z0-9_]*/g)].map(m => m[0]);
console.log("\nContent references:");
[...new Set(contentRefs)].forEach(c => console.log("  " + c));

// Check NativeImage references
const imageRefs = [...text.matchAll(/[A-Za-z0-9_]*[Ii]mage[A-Za-z0-9_]*/g)].map(m => m[0]);
console.log("\nImage references:");
[...new Set(imageRefs)].forEach(c => console.log("  " + c));

// Try to find the superclass by checking which class ResourceTexture refers to
// In the bytecode, the super() call typically references the superclass
const superRefs = [...text.matchAll(/class_10[45][0-9]/g)].map(m => m[0]);
console.log("\nNearby class references:");
[...new Set(superRefs)].forEach(c => console.log("  " + c));
