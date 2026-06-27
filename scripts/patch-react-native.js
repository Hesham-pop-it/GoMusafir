const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../node_modules/react-native/index.js');

if (fs.existsSync(targetFile)) {
    console.log('Patching react-native index.js for Node v22 compatibility (v3)...');
    let content = fs.readFileSync(targetFile, 'utf8');
    
    // 1. Remove Flow Imports
    content = content.replace(/import typeof [^;]*;/g, '// removed flow import typeof');
    content = content.replace(/import type [^;]*;/g, '// removed flow import type');
    
    // 2. Remove Flow Exports
    content = content.replace(/export type [^;]*;/g, '// removed flow export type');

    // 3. Remove Flow Type Annotations on Getters (The specific cause of the SyntaxError)
	// Example: get RefreshControl(): RefreshControl { -> get RefreshControl() {
    content = content.replace(/get\s+([A-Za-z0-9_]+)\(\):\s+([\$A-Za-z0-9_<>]+)\s+{/g, 'get $1() {');
    
	// 4. Remove other simple type annotations on object keys
    // Example: invariant: (condition: any) => void, -> invariant: (condition) => void,
    // (This is more risky so we keep it targeted)
    
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('react-native patch applied successfully.');
} else {
    console.log('react-native/index.js not found. Skipping patch.');
}

// --- Patch 2: @livekit/react-native package.json (Metro Exports fix) ---
const livekitPkg = path.join(__dirname, '../node_modules/@livekit/react-native/package.json');
if (fs.existsSync(livekitPkg)) {
    console.log('Patching @livekit/react-native package.json for Metro resolution...');
    let pkg = JSON.parse(fs.readFileSync(livekitPkg, 'utf8'));
    
    // Fix missing extensions in exports (Metro Requirement)
    if (pkg.exports && pkg.exports['.'] && pkg.exports['.'].default === './lib/commonjs/index') {
        pkg.exports['.'].default = './lib/commonjs/index.js';
        console.log('Updated exports.default');
    }
    
    if (pkg.main === 'lib/commonjs/index') {
        pkg.main = 'lib/commonjs/index.js';
        console.log('Updated main');
    }

    fs.writeFileSync(livekitPkg, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('@livekit/react-native patch applied successfully.');
}

// --- Patch 3: Metro packages exports fix for @expo/cli compatibility ---
console.log('Scanning and patching Metro packages for Expo CLI compatibility...');
function findAndPatchMetro(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file === 'metro' || file.startsWith('metro-')) {
                const pkgJsonPath = path.join(fullPath, 'package.json');
                if (fs.existsSync(pkgJsonPath)) {
                    try {
                        let pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
                        if (pkg.exports && !pkg.exports['./src/*']) {
                            console.log(`Patching exports in ${pkgJsonPath} (${pkg.name}@${pkg.version})...`);
                            pkg.exports['./src/*'] = './src/*.js';
                            pkg.exports['./src/*.js'] = './src/*.js';
                            pkg.exports['./src'] = './src/index.js';
                            fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
                        }
                    } catch (e) {
                        console.error(`Failed to patch ${pkgJsonPath}:`, e);
                    }
                }
            }
            findAndPatchMetro(fullPath);
        }
    }
}

findAndPatchMetro(path.join(__dirname, '../node_modules'));
console.log('Metro exports patching completed.');


