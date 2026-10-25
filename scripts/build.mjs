import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=join(root,'dist'), output=resolve(root,'site');
if(output!==join(root,'site') || !output.startsWith(root+sep)) throw new Error('Diretório de build inválido.');
async function walk(directory) {
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if(entry.isDirectory()) files.push(...await walk(path)); else files.push(path);
  }
  return files.sort();
}
const files=await walk(source), hash=createHash('sha256');
for(const path of files) hash.update(relative(source,path)).update(await readFile(path));
const version=hash.digest('hex').slice(0,12);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(source,output,{recursive:true});
for(const path of files) {
  let contents;
  if(path.endsWith('.js')) contents=(await readFile(path,'utf8')).replace(/(from\s*['"])(\.\/[^'"]+\.js)(['"])/g,`$1$2?v=${version}$3`);
  if(path.endsWith('.html')) contents=(await readFile(path,'utf8')).replace(/((?:href|src)=")([^" :]+\.(?:css|js))(\")/g,`$1$2?v=${version}$3`);
  if(contents!==undefined) {const target=join(output,relative(source,path));await mkdir(dirname(target),{recursive:true});await writeFile(target,contents);}
}
console.log(`Site gerado em ${output} · versão ${version}`);
