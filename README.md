# Ghost

an imessage agent built for neurodivergent brains.

catches you before you ghost someone. drafts the reply in your voice. catches your random thoughts before they disappear. all inside your texts.

no app. no dashboard. no new habit. just imessage.

---

## what is this

ghost does two things:

**1. anti-ghosting** - scans your unreplied DMs, texts you a nudge with 3 ai-drafted replies in your voice, you text back a number, reply sent.

**2. brain dump** - text yourself anything. ghost catches it, categorizes it (todo/idea/note/link/reminder), and surfaces it back when you need it. no more thoughts lost to scroll.

both features exist because neurodivergent brains need tools that remove friction, not add it. ghost lives inside imessage because that's where the problems actually happen.

---

## why

15 million adults in the US have adhd. a huge chunk of them describe the same thing online:

> "I have a 2-second or 2-week response window. There is no in-between."
> - r/ADHD

> "I open the text, compose the perfect reply in my head - then put my phone down and forget for 3 days."
> - r/adhdmeme

> "I've lost friendships over this. Not because I stopped caring, but because my brain stopped cooperating."
> - r/ADHD

> "The guilt of not replying makes it even harder to reply. It's a death spiral."
> - r/ADHDwomen

the adhd community calls it **involuntary ghosting**. the pattern:

1. read the message. fully intend to reply.
2. get pulled away. executive function hijacked.
3. remember hours later. now it's awkward.
4. guilt. shame. avoid.
5. friendship erodes quietly.

and the other half of the problem - you text yourself ideas, todos, links, random thoughts. they scroll away in minutes. gone.

every existing tool - reminder apps, planners, "reply later" buttons - lives outside the problem. another app to open. another notification to ignore. another thing your brain has to remember.

**ghost lives where the problems live. inside your texts.**

---

## anti-ghosting

ghost scans your imessage for unreplied DMs. when one ages out it texts you:

```
You're ghosting Sarah (1 hr ago)

"Hey are we still on for coffee tomorrow?"

Quick replies:
1. yeah totally, same place as last time?
2. yes! looking forward to it - see you there
3. yep see you tomorrow

Reply 1, 2, or 3 to send - or type your own.
```

text `2`. ghost sends it to sarah. done. 2 seconds.

**voice matching** - ghost reads your past texts with that person and drafts in YOUR style. lowercase, slang, whatever. the person on the other end can't tell.

**urgency detection** - "are you okay?" gets nudged 4x faster. "lol" can wait.

**spam filtering** - skips verification codes, promo texts, short codes, brand messages. only real humans.

**one at a time** - no notification avalanche. one nudge, you deal with it, next one comes.

---

## brain dump

text yourself anything. ghost catches it.

```
you: buy milk
ghost: + caught as todo

you: what if we used websockets instead
ghost: > caught as idea

you: remind me to call dentist in 2 hours
ghost: ! caught as reminder (will remind you)

you: https://some-article.com
ghost: # caught as link
```

text `ghost dump` to see everything:

```
brain dump:

todos (3):
  - buy milk
  - finish the pitch deck
  - call dentist

ideas (2):
  > what if we used websockets instead
  > dark mode for the landing page

links (1):
  # https://some-article.com
```

text `ghost done buy milk` to mark it done.

no more thoughts lost to scroll. no more texting yourself and forgetting 10 minutes later.

---

## how it maps to neurodivergent brains

| barrier | what ghost does |
|---------|----------------|
| executive dysfunction - can't start the reply | starts it for you. pick 1, 2, or 3 |
| decision fatigue - "what do i even say?" | 3 replies pre-written in your voice |
| context-switching - opening a chat feels like a task | nudge arrives in imessage. you're already there |
| time blindness - don't realize how long it's been | ghost tracks time. nudges before it's too late |
| object permanence - out of sight out of mind | ghost doesn't forget. resurfaces what you can't see |
| thought capture - ideas vanish in seconds | text yourself anything. ghost catches it |
| guilt spiral - shame makes it harder | no guilt. no shame. just options |

---

## why this is personal

i'm building [navia](https://joinnavia.com) - an ai companion for neurodivergent people hitting the support cliff after college. all the structure disappears overnight. accommodations, counselors, routines - gone.

navia's philosophy: the agent IS the interface. you shouldn't have to leave a conversation to get something done.

ghost is the same idea applied to texting. both are built on the same belief: tech for neurodivergent people fails when it adds cognitive load. it works when it removes it.

---

## setup

you need macos, bun, full disk access for your terminal, and a free groq api key.

```bash
git clone https://github.com/SankrityaT/Ghost.git
cd Ghost
bun install
cp .env.example .env
# add your phone number and groq key
bun run start
```

## commands

| command | what it does |
|---------|-------------|
| `1` / `2` / `3` | send a draft reply |
| `ghost skip` / `ghost later` | snooze 30 min |
| `ghost snooze 1h` | custom snooze |
| `ghost dismiss` | skip permanently |
| `ghost status` | unreplied messages |
| `ghost report` | relationship health score |
| `ghost dump` | see your brain dump |
| `ghost done [text]` | mark a dump item done |
| `ghost [anything]` | chat naturally |
| text yourself anything | ghost catches it as a brain dump |

## architecture

```
ghost-agent/
├── src/
│   ├── agent.ts      # main loop, watcher, commands, brain dump catch
│   ├── scanner.ts    # finds unreplied DMs via getUnreadMessages()
│   ├── drafter.ts    # ai reply drafting with voice matching
│   ├── priority.ts   # urgency detection
│   ├── tracker.ts    # relationship health tracking
│   └── dump.ts       # brain dump capture + categorization
├── data/             # auto-created state
└── .env.example
```

**sdk usage:** `getUnreadMessages()`, `getMessages()`, `send()`, `startWatching()`, `listChats()`, `Reminders`, watcher config, message fields

**stack:** [photon imessage kit](https://github.com/photon-hq/imessage-kit) · [ai sdk](https://sdk.vercel.ai) · [groq](https://groq.com) · bun

## references

- [cdc adhd data](https://www.cdc.gov/ncbddd/adhd/data.html) - 15.5M adults with adhd in the US
- [r/ADHD](https://reddit.com/r/ADHD), [r/ADHDwomen](https://reddit.com/r/ADHDwomen) - involuntary ghosting + texting guilt
- [additude magazine](https://www.additudemag.com/) - executive dysfunction research
- [navia](https://joinnavia.com) - ai companion for the neurodivergent support cliff

---

built with [@photon-ai/imessage-kit](https://github.com/photon-hq/imessage-kit) for the [photon residency](https://photonhq.com/residency2).
