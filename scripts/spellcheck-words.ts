export {};

const input = await Bun.stdin.text();

const counts = new Map<string, number>();

for (const line of input.split(/\r?\n/)) {
  const word = line.trim();

  if (!word) {
    continue;
  }

  counts.set(word, (counts.get(word) ?? 0) + 1);
}

const entries = [...counts.entries()].sort((left, right) => {
  if (right[1] !== left[1]) {
    return right[1] - left[1];
  }

  return left[0].localeCompare(right[0]);
});

if (entries.length === 0) {
  console.log('No unknown words found.');
  process.exit(0);
}

console.log('Candidate words for cspell.json review:\n');

for (const [word, count] of entries) {
  console.log(`${String(count).padStart(3, ' ')}  ${word}`);
}
