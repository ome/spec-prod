// @ts-check
const { env, exit, setOutput, sh } = require("./utils.js");

const toolchain = env("INPUTS_TOOLCHAIN");
const source = env("INPUTS_SOURCE");

(async () => {
	console.log(`Converting Bikeshed document '${source}' to HTML...`);
	await sh(`bikeshed spec "latest/${source}" "latest/index.out.html"`, "stream");
	console.log(`Converting Bikeshed document '${source}' to HTML...`);
	await sh(`bikeshed spec "0.1/${source}" "0.1/index.out.html"`, "stream");
})()
	.catch(err => exit(err.message || "Failed", err.code));
