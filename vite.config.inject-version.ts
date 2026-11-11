import child_process from 'child_process'
import fs from 'fs'
import path from 'path'
import packageJson from './package.json' with { type: 'json' }

import type { Plugin } from 'vite'

const writeVersionFile = async (version: string) => {
  const versionFile = await fs.promises.open(path.resolve(import.meta.dirname, 'dist/.version'), 'w')

  await versionFile.writeFile(`v${version}`)

  await versionFile.close()
}

const writeReleaseInfoFile = async (version: string, owner: string, repository: string) => {
  const releaseInfoFile = await fs.promises.open(path.resolve(import.meta.dirname, 'dist/release_info.json'), 'w')

  await releaseInfoFile.writeFile(JSON.stringify({
    project_name: repository,
    project_owner: owner,
    version: `v${version}`
  }))

  await releaseInfoFile.close()
}

const vitePluginInjectVersion = (): Plugin => {
  let version = packageJson.version
  let owner = 'fluidd-core'
  let repository = 'fluidd'
  return {
    name: 'version',
    config: ({ mode }) => {
      if (mode === 'multitool') {
        version = `${packageJson.version}-multitool.${process.env.GITHUB_RUN_NUMBER ?? '0'}`
        const repositoryParts = (process.env.GITHUB_REPOSITORY ?? 'jacksky6/fluidd').split('/')
        owner = repositoryParts[0]
        repository = repositoryParts[1]
      }
      const git_hash = child_process
        .execSync('git rev-parse --short HEAD')
        .toString()

      return {
        define: {
          'import.meta.env.VERSION': JSON.stringify(version),
          'import.meta.env.HASH': JSON.stringify(git_hash)
        }
      }
    },
    writeBundle: () => {
      setImmediate(async () => {
        await writeVersionFile(version)
        await writeReleaseInfoFile(version, owner, repository)
      })
    }
  }
}

export default vitePluginInjectVersion
