// @ts-check
const { env, exit, sh, yesOrNo } = require("./utils.js");

if (yesOrNo(env("INPUTS_VALIDATE_LINKS")) === false) {
	exit("Skipped", 0);
}

(async () => {
	await sh(`yarn global add href-checker`, "stream");
	await sh(`href-checker "latest/index.out.html" --no-same-site`, "stream");
	await sh(`href-checker "0.2/index.out.html" --no-same-site`, "stream");
	await sh(`href-checker "0.1/index.out.html" --no-same-site`, "stream");
})().catch(err => exit("Failed.", err.code));
