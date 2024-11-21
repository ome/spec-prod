// @ts-check
const { env, exit, setOutput, sh } = require("./utils.js");

const toolchain = env("INPUTS_TOOLCHAIN");
const source = env("INPUTS_SOURCE");

(async () => {
	console.log(`Converting Bikeshed document '${source}' to HTML...`);
	await sh(`bikeshed spec "latest/${source}" "latest/index.out.html"`, "stream");
	await sh(`bikeshed spec "0.5/${source}" "0.5/index.out.html"`, "stream");
	await sh(`bikeshed spec "0.4/${source}" "0.4/index.out.html"`, "stream");
	await sh(`bikeshed spec "0.3/${source}" "0.3/index.out.html"`, "stream");
	await sh(`bikeshed spec "0.2/${source}" "0.2/index.out.html"`, "stream");
	await sh(`bikeshed spec "0.1/${source}" "0.1/index.out.html"`, "stream");
})()
	.catch(err => exit(err.message || "Failed", err.code));
