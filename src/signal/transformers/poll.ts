export async function pollTransformer(payload: any) {
  const poll = payload.poll
  if (!poll) return payload

  return {
    ...payload,
    pollCreationMessage: {
      name: poll.name,
      options: poll.options.map((o: string) => ({ optionName: o })),
      selectableOptionsCount: poll.selectableCount || 1
    }
  }
}
