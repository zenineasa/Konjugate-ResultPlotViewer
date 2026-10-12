/* Copyright © 2026 Zenin Easa Panthakkalakath */

// Everything downstream of the build takes whichever .kja it finds in out/. The build used to leave
// the archives of earlier versions there, so once the version moved on from 0.1.0,
// `npm run install:dev` kept reporting success while installing that oldest build, and no change
// ever showed up in the app.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installBuiltPackage } from '../scripts/installDev.mjs';
import { repoRoot } from '../scripts/konjugatePaths.mjs';

test('the build leaves only its own archive in out/, and install:dev installs that version', async () => {
    const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const outputDirectory = join(repoRoot, 'out');
    // Sorts ahead of any real version, as the leftover 0.1.0 archive did.
    execFileSync('node', ['scripts/build.mjs'], { cwd: repoRoot, stdio: 'inherit' });
    writeFileSync(join(outputDirectory, 'konjugate.resultPlotViewer-0.0.0.kja'), 'an archive left over from an earlier version');
    execFileSync('node', ['scripts/build.mjs'], { cwd: repoRoot, stdio: 'inherit' });
    assert.deepEqual(readdirSync(outputDirectory).filter((name) => name.endsWith('.kja')), [`konjugate.resultPlotViewer-${version}.kja`]);

    const userData = mkdtempSync(join(tmpdir(), 'resultPlotViewer-install-'));
    try {
        const installed = await installBuiltPackage(userData);
        assert.equal(installed.packageManifest.version, version);
        assert.ok(existsSync(join(userData, 'packages', 'addons', 'konjugate.resultPlotViewer', version, 'viewer.mjs')));
    } finally {
        rmSync(userData, { recursive: true, force: true });
    }
});
