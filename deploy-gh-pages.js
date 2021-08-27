// @ts-check
const path = require("path");
const os = require("os");
const fs = require("fs").promises;
const { env, exit, sh } = require("./utils.js");

/** @type {import("./prepare.js").GithubPagesDeployOptions} */
const inputs = JSON.parse(env("INPUTS_DEPLOY"));

if (inputs === false) {
	exit("Skipped.", 0);
	process.exit(1); // TypeScript Bug. It cries.
}

const { targetBranch, token, event, sha, repository, actor } = inputs;

main().catch(error => exit(error));

async function main() {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-prod-output-"));
	const latestDir = await fs.mkdtemp(path.join(tmpDir, "latest"));
	const latestOut = path.join(latestDir, "index.out.html");
	const v03Dir = await fs.mkdtemp(path.join(tmpDir, "0.3"));
	const v03Out = path.join(v03Dir, "index.out.html");
	const v02Dir = await fs.mkdtemp(path.join(tmpDir, "0.2"));
	const v02Out = path.join(v02Dir, "index.out.html");
	const v01Dir = await fs.mkdtemp(path.join(tmpDir, "0.1"));
	const v01Out = path.join(v01Dir, "index.out.html");
	let error = null;
	try {
		await fs.rename("latest/index.out.html", latestOut);
		await fs.rename("0.3/index.out.html", v03Out);
		await fs.rename("0.2/index.out.html", v02Out);
		await fs.rename("0.1/index.out.html", v01Out);
		await prepare();

        // Create in case previously empty
        await fs.mkdir("latest", { recursive: true });
        await fs.mkdir("0.3", { recursive: true });
        await fs.mkdir("0.2", { recursive: true });
        await fs.mkdir("0.1", { recursive: true });

		await fs.copyFile(latestOut, "latest/index.html");
		await fs.copyFile(v03Out, "0.3/index.html");
		await fs.copyFile(v02Out, "0.2/index.html");
		await fs.copyFile(v01Out, "0.1/index.html");
		const committed = await commit();
		if (!committed) {
			await cleanUp(latestOut, "latest/index.out.html", "latest/index.html");
			await cleanUp(v03Out, "0.3/index.out.html", "0.3/index.html");
			await cleanUp(v02Out, "0.2/index.out.html", "0.2/index.html");
			await cleanUp(v01Out, "0.1/index.out.html", "0.1/index.html");
			exit(`Nothing to commit. Skipping deploy.`, 0);
		}
		await push();
	} catch (err) {
		console.log(err);
		error = err;
	} finally {
		await cleanUp(latestOut, "latest/index.out.html", "latest/index.html");
		await cleanUp(v03Out, "0.3/index.out.html", "0.3/index.html");
		await cleanUp(v02Out, "0.2/index.out.html", "0.2/index.html");
		await cleanUp(v01Out, "0.1/index.out.html", "0.1/index.html");
		if (error) {
			console.log();
			console.log("=".repeat(60));
			exit(error.message);
		}
	}
}

/**
 * @param {string} tmpOutputFile
 */
async function prepare() {

	// Clean up working tree
	await sh(`git checkout -- .`);

	// Check if target branch remote exists on remote.
	// If it exists, we do a pull, otherwise we create a new orphan branch.
	const repoUri = `https://github.com/${repository}.git/`;
	if (await sh(`git ls-remote --heads "${repoUri}" "${targetBranch}"`)) {
		await sh(`git fetch origin "${targetBranch}"`, "stream");
		await sh(`git checkout "${targetBranch}"`, "stream");
	} else {
		await sh(`git checkout --orphan "${targetBranch}"`, "stream");
	}
}

async function commit() {
	const GITHUB_ACTIONS_BOT = `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`;

	await sh(`git add .`);
	await sh(`git status`, "stream");

	const author = await sh(`git show -s --format='%an | %ae' ${sha}`);
	const [name, email] = author.split(" | ");
	await sh(`git config user.name "${name}"`);
	await sh(`git config user.email "${email}"`);

	const originalCommmitMessage = await sh(`git log --format=%B -n1 ${sha}`);
	const commitMessage = [
		`chore(rebuild): ${originalCommmitMessage}`,
		"",
		`SHA: ${sha}`,
		`Reason: ${event}, by @${actor}`,
		"",
		"",
		`Co-authored-by: ${GITHUB_ACTIONS_BOT}`,
	].join("\n");
	const COMMIT_MESSAGE_FILE = path.join(os.tmpdir(), "COMMIT_MSG");
	await fs.writeFile(COMMIT_MESSAGE_FILE, commitMessage, "utf-8");

	try {
		await sh(`git commit --file "${COMMIT_MESSAGE_FILE}"`);
		await sh(`git log -p -1 --color --word-diff`, "stream");
		return true;
	} catch (error) {
		return false;
	}
}

async function push() {
	const repoURI = `https://x-access-token:${token}@github.com/${repository}.git/`;
	await sh(`git remote set-url origin "${repoURI}"`);
	await sh(`git push --force-with-lease origin "${targetBranch}"`, "stream");
}

/**
 * @param {string} tmpOutputFile
 */
async function cleanUp(tmpOutputFile, outputFile, targetFile) {
	try {
		await fs.unlink(targetFile);
	} catch {}

	try {
		await sh(`git checkout -`);
		await sh(`git checkout -- .`);
	} catch {}

	try {
		await fs.copyFile(tmpOutputFile, outputFile);
	} catch {}
}
