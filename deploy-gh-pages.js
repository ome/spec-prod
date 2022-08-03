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
	const versions = ["latest", "0.4", "0.3", "0.2", "0.1"]
	const schemas = ["image.schema", "strict_image.schema", "label.schema", "strict_label.schema", "plate.schema", "strict_plate.schema", "well.schema", "strict_well.schema"]
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-prod-output-"));
	let error = null;
	try {
		for (const version of versions) {
			await fs.mkdir(path.join(tmpDir, version, "schemas"), { recursive: true });
			await fs.rename(path.join(version, "index.out.html"), path.join(tmpDir, version, "index.html"));
			for (const schema of schemas) {
				try {
					await fs.rename(
						path.join(version, "schemas", schema),
						path.join(tmpDir, version, "schemas", schema));
				} catch (error) {
					if (error.code === "ENOENT") {
						console.log('No %s found for %s', schema, version);
					} else {
						console.log(error);
					}
				}
			}
		}
		await prepare();

		for (const version of versions) {
		// Create in case previously empty
			await fs.mkdir(path.join(version, "schemas"), { recursive: true });
			await fs.rename(
				path.join(tmpDir, version, "index.html"),
				path.join(version, "index.html"));
			for (const schema of schemas) {
				try {
					await fs.rename(
						path.join(tmpDir, version, "schemas", schema),
						path.join(version, "schemas", schema));
					console.info("Copied %s/schemas/%s", version, schema);
				} catch (error) {
					console.log(error);
				}
			}
		}
		const committed = await commit();
		if (!committed) {
			for (const version of versions) {
				await cleanUp(
					path.join(tmpDir, version),
					path.join(version, "index.out.html"),
					path.join(version, "index.html"));
			}
			exit(`Nothing to commit. Skipping deploy.`, 0);
		}
		await push();
	} catch (err) {
		console.log(err);
		error = err;
	} finally {
		for (const version of versions) {
			await cleanUp(
				path.join(tmpDir, version),
				path.join(version, "index.out.html"),
				path.join(version, "index.html"));
		}
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
