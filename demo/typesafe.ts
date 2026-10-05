export async function jevSystemOne(req: { state: string; questions: Record<string, unknown> }) {
  await new Promise((resolve) => setTimeout(resolve, 250))
  const score = req.state.includes('演示待筛选') ? 1.8 : 3.8
  return {
    model: 'offline-fixture',
    answers: Object.fromEntries(
      Object.keys(req.questions).map((key) => [
        key,
        key === 'fit'
          ? { type: 'score', score }
          : { type: 'noul', noul: key.startsWith('avoid_') ? 0.1 : 0.8 },
      ]),
    ),
  }
}
