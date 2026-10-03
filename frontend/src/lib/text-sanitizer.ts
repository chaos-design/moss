const emojiPattern =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\uFE0F|\u20E3)/gu

export function stripEmoji(value: string) {
  return value
    .replace(emojiPattern, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}
