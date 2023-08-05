const pkg = require('../package.json');
const browserify = require('browserify');
const camelCase = require('lodash.camelcase');
const fs = require('fs');

function getFilePath(path) {
    return `${__dirname}/../${path}`;
}

const inputFile = getFilePath(pkg.main);
const outputFile = getFilePath(pkg.main).replace(/\.js$/, '.full.js');

const b = browserify(inputFile, {
    standalone: camelCase(pkg.name)
});

b.bundle().pipe(fs.createWriteStream(outputFile));


// 复制ts类型声明文件
fs.readFile(getFilePath(pkg.typings), 'utf8', (err, data) => {
    if (err) {
        console.error(`复制d.ts文件时发生错误, err=${err.message}`);
    } else {
        fs.writeFile(getFilePath(pkg.main).replace(/\.js$/, '.full.d.ts'), data, (err) => {
            if (err) {
                console.error(`复制d.ts文件时发生错误, err=${err.message}`);
            }
        });
    }
});
