export const projectInfo = Object.freeze({
  name: 'Boss Helper Jev',
  shortName: 'Jev Helper',
  // 上游地址只用于来源说明；反馈和发布入口使用本版仓库。
  repositoryUrl: 'https://github.com/az1412/boss-helper-jev',
  upstreamUrl: 'https://github.com/Ocyss/boss-helper',
  remoteUpdates: false,
})

export function getProjectLinks(repositoryUrl: string = projectInfo.repositoryUrl) {
  const repository = repositoryUrl.trim().replace(/\/+$/, '')
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository)) {
    return { repository: null, issues: null, releases: null }
  }
  return {
    repository,
    issues: `${repository}/issues`,
    releases: `${repository}/releases`,
  }
}
