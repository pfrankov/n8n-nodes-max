#!/usr/bin/env node

/**
 * Debug Verification Script for n8n-nodes-max
 * This script verifies that the package is ready for n8n integration
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 n8n-nodes-max Debug Verification\n');

// Check if package is built
console.log('📦 Checking build status...');
const distExists = fs.existsSync('./dist');
if (!distExists) {
    console.log('❌ dist/ directory not found. Run: npm run build');
    process.exit(1);
}
console.log('✅ dist/ directory exists');

// Check credentials
console.log('\n🔐 Checking credentials...');
const credentialsDir = './dist/credentials';
if (!fs.existsSync(credentialsDir)) {
    console.log('❌ dist/credentials/ directory not found');
    process.exit(1);
}

const credentialFiles = fs.readdirSync(credentialsDir).filter(f => f.endsWith('.js'));
console.log(`✅ Found ${credentialFiles.length} credential files:`);
credentialFiles.forEach(file => {
    console.log(`   - ${file}`);
});

// Verify MaxApi credentials specifically
console.log('\n🎯 Verifying MaxApi credentials...');
try {
    const { MaxApi } = require('./dist/credentials/MaxApi.credentials.js');
    const maxApi = new MaxApi();
    
    console.log('✅ MaxApi credentials loaded successfully');
    console.log(`   - Name: ${maxApi.name}`);
    console.log(`   - Display Name: ${maxApi.displayName}`);
    console.log(`   - Properties: ${maxApi.properties.length}`);
    console.log(`   - Test endpoint: ${maxApi.test.request.url}`);
} catch (error) {
    console.log('❌ Failed to load MaxApi credentials:', error.message);
    process.exit(1);
}

// Check package.json n8n configuration
console.log('\n📋 Checking n8n configuration...');
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

if (!packageJson.n8n) {
    console.log('❌ No n8n configuration found in package.json');
    process.exit(1);
}

console.log('✅ n8n configuration found:');
console.log(`   - API Version: ${packageJson.n8n.n8nNodesApiVersion}`);
console.log(`   - Credentials: ${packageJson.n8n.credentials.length}`);
console.log(`   - Nodes: ${packageJson.n8n.nodes.length}`);

// Verify all registered files exist
console.log('\n📁 Verifying registered files...');
let allFilesExist = true;

packageJson.n8n.credentials.forEach(credFile => {
    if (fs.existsSync(credFile)) {
        console.log(`✅ ${credFile}`);
    } else {
        console.log(`❌ ${credFile} - FILE NOT FOUND`);
        allFilesExist = false;
    }
});

packageJson.n8n.nodes.forEach(nodeFile => {
    if (fs.existsSync(nodeFile)) {
        console.log(`✅ ${nodeFile}`);
    } else {
        console.log(`❌ ${nodeFile} - FILE NOT FOUND`);
        allFilesExist = false;
    }
});

if (!allFilesExist) {
    console.log('\n❌ Some registered files are missing. Run: npm run build');
    process.exit(1);
}

// Check if package is linked
console.log('\n🔗 Checking npm link status...');
try {
    const { execSync } = require('child_process');
    const linkOutput = execSync('npm ls -g --depth=0 2>/dev/null || true', { encoding: 'utf8' });
    
    if (linkOutput.includes('n8n-nodes-max')) {
        console.log('✅ Package is globally linked');
    } else {
        console.log('⚠️  Package not globally linked. Run: npm run debug:setup');
    }
} catch (error) {
    console.log('⚠️  Could not check link status');
}

// Check n8n installation
console.log('\n🚀 Checking n8n installation...');
try {
    const { execSync } = require('child_process');
    const n8nVersion = execSync('n8n --version 2>/dev/null || echo "not found"', { encoding: 'utf8' }).trim();
    
    if (n8nVersion !== 'not found') {
        console.log(`✅ n8n installed: ${n8nVersion}`);
    } else {
        console.log('❌ n8n not installed globally. Run: npm run debug:install-n8n');
    }
} catch (error) {
    console.log('❌ n8n not found. Run: npm run debug:install-n8n');
}

// Check n8n custom directory
console.log('\n📂 Checking n8n custom directory...');
const os = require('os');
const n8nCustomDir = path.join(os.homedir(), '.n8n', 'custom');

if (fs.existsSync(n8nCustomDir)) {
    console.log(`✅ n8n custom directory exists: ${n8nCustomDir}`);
    
    // Check if package is linked in custom directory
    const packageJsonPath = path.join(n8nCustomDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const customPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (customPackageJson.dependencies && customPackageJson.dependencies['n8n-nodes-max']) {
                console.log('✅ Package linked in n8n custom directory');
            } else {
                console.log('⚠️  Package not linked in n8n custom directory');
                console.log(`   Run: cd ${n8nCustomDir} && npm link n8n-nodes-max`);
            }
        } catch (error) {
            console.log('⚠️  Could not read custom directory package.json');
        }
    } else {
        console.log('⚠️  No package.json in custom directory');
        console.log(`   Run: cd ${n8nCustomDir} && npm init -y && npm link n8n-nodes-max`);
    }
} else {
    console.log(`⚠️  n8n custom directory not found: ${n8nCustomDir}`);
    console.log('   Create it with: mkdir -p ~/.n8n/custom && cd ~/.n8n/custom && npm init -y');
}

console.log('\n🎯 Debug Instructions:');
console.log('1. One-time setup: npm run debug:setup');
console.log('2. Start n8n: npm run debug:start');
console.log('3. Open browser: http://localhost:5678');
console.log('4. Search for "Max API" in credentials or nodes');
console.log('');
console.log('💡 Development: Just run "npm run build" after changes (symlink handles the rest)');

console.log('\n✅ Verification complete!');