# Ghost

you've ghosted someone this week. not because you're a bad person. because your brain just works differently.

ghost is an imessage agent that catches you before you ghost someone, drafts the reply in your voice, and sends it when you text back a single number.

no app. no dashboard. no new habit to build. just a text.

---

## tldr

text it, pick a number, reply sent. that's it.

"it's an imessage agent that notices when you're about to ghost someone and writes the reply for you — you just text back 1, 2, or 3."

**would you use this tomorrow?** you don't have to remember to. ghost texts you. it runs in the background and only shows up when you're about to leave someone on read. the people who need this most — adhd, executive dysfunction, anxiety — are the same people who can't keep up with another app. ghost doesn't ask that. it just watches your back.

**is it conversation-native?** there's no ui. no web page. no app. everything happens in imessage. nudges come as texts. you reply as texts. that's the whole product.

---

## the problem

there's a moment like 15 million adults in the US know really well:

you open a text. you read it. you mean to reply. and then you just… don't.

not because you don't care. because something — adhd, executive dysfunction, anxiety, decision fatigue — puts a wall between reading the message and actually responding.

the adhd community calls it **involuntary ghosting**. if you search reddit you'll find thousands of people describing this exact cycle:

> "I have a 2-second or 2-week response window. There is no in-between."
> — r/ADHD

> "I open the text, compose the perfect reply in my head — then put my phone down and forget for 3 days."
> — r/adhdmeme

> "I've lost friendships over this. Not because I stopped caring, but because my brain stopped cooperating."
> — r/ADHD

> "The guilt of not replying makes it even harder to reply. It's a death spiral."
> — r/ADHDwomen

the pattern is always the same:

1. read the message. fully intend to reply.
2. get pulled away. another notification, another thought.
3. remember hours later. now it feels weird. what do you even say?
4. guilt spiral. "they probably think i don't care."
5. avoid it entirely. the longer you wait the harder it gets.
6. friendship erodes. slowly. silently. one unanswered text at a time.

this isn't laziness. reading a message is passive. composing a reply requires decision-making, context-switching, and action initiation — exactly the things adhd makes hard.

### why nothing else works

every tool out there — reminder apps, adhd planners, habit trackers, "reply later" buttons — makes the same mistake:

**they live outside the problem.**

- reminder app sends a push notification → buried in 47 other notifications
- habit tracker needs you to open a separate app → executive dysfunction blocks that too
- "reply later" saves the message → never surfaces it in a useful way
- adhd planner adds "reply to texts" to a to-do list → now it's one of 30 items you'll stare at

they all add another step. for a brain that can't bridge "read" to "respond," every extra step is another wall.

### the insight

**the solution should live where the problem lives.**

you don't ghost people in a planner app. you ghost them in imessage. so that's where ghost lives.

ghost is for the person who cares but can't reply — not the person waiting for one.

---

## what it does

### catches you before you ghost

runs silently on your mac. scans imessage for unreplied DMs. when one ages out, ghost texts you — one at a time, no flooding:

```
You're ghosting Sarah (1 hr ago)

"Hey are we still on for coffee tomorrow?"

Quick replies:
1. yeah totally, same place as last time?
2. yes! looking forward to it — see you there
3. yep see you tomorrow

Reply 1, 2, or 3 to send — or type your own.
```

you text `2`. ghost sends it to sarah. 2 seconds. done.

one nudge at a time. no avalanche of notifications. because that's how adhd brains work best — one thing at a time.

### drafts replies in YOUR voice

ghost reads your past messages and learns how you actually text. if you use lowercase and slang the drafts match. if you're formal they match too.

the person on the other end can't tell. because the reply sounds like you. not like a robot.

### detects urgency

not all messages are equal:

- "are you okay?" / "where are you?" → **urgent**, nudge 4x faster
- "want to grab dinner?" → normal timing
- "lol" / emoji reactions → low priority, 3x slower

safety checks and deadlines get flagged immediately. memes can wait.

### filters out the noise

ghost only nudges about real humans. it automatically skips:

- verification codes ("your code is 847291")
- short codes (5-6 digit senders)
- promotional texts ("FragranceNet: 20% off!")
- brand messages, unsubscribe texts, marketing blasts

no notification fatigue from spam. only the messages that actually matter.

### tracks your relationship health

the scariest part of involuntary ghosting is that the damage is invisible. you don't notice a friendship dying one unanswered text at a time.

text `ghost report` to see your score:

```
Ghost Report

Score: B (78% reply rate)
This week: 14 replied, 4 ghosted

Most ghosted:
  Mom — 3x ghosted
  Jake — 2x ghosted

Slowest replies:
  Sarah — avg 3hr

Best streaks:
  Mike — 12 day streak
```

not a guilt trip. just awareness.

### talk to it naturally

you can just chat with ghost. text `ghost how am i doing?` or `ghost who am i ghosting the most?` and it responds with your actual data. no need to memorize commands.

---

## the adhd connection

every feature maps directly to an adhd barrier:

| barrier | how ghost handles it |
|---------|---------------------|
| executive dysfunction — can't start the reply | ghost starts it for you. just pick 1, 2, or 3 |
| decision fatigue — "what do i even say?" | 3 replies pre-written in your voice |
| context-switching — opening a chat feels like a task | nudge arrives in imessage where you already are |
| time blindness — don't realize how long it's been | ghost tracks time and nudges before it's too late |
| late-reply anxiety — "it's been too long it's weird now" | ai calibrates for elapsed time. doesn't over-apologize |
| object permanence — out of sight out of mind | ghost doesn't forget |
| guilt spiral — shame makes it harder not easier | no guilt. no shame. just options |
| invisible damage — can't see friendships eroding | ghost report makes patterns visible |

---

## why this is personal

i'm building [navia](https://joinnavia.com) — an ai companion for neurodivergent people navigating what we call the **support cliff**. that moment after college when all the structure disappears overnight. accommodations, disability services, counselors, routines — gone.

navia's philosophy is simple: the agent IS the interface. you shouldn't have to leave a conversation to get something done. the product should meet you where you are, not make you come to it.

ghost is the same idea applied to texting.

both are built on the same belief: tech for neurodivergent people fails when it adds cognitive load. it works when it removes it.

navia watches your back in life. ghost watches your back in the one place where relationships quietly die — your unread texts.

---

## how it works

```
incoming text from sarah
  ↓
ghost scans every 15 min
  ↓
filters out spam, verification codes, promo texts
  ↓
priority detection: "are you okay?" → nudge 4x faster
  ↓
reads YOUR past messages to learn your voice
  ↓
drafts 3 replies via groq (llama-3.3-70b)
  ↓
texts you one nudge at a time
  ↓
you reply 1, 2, or 3
  ↓
ghost sends it. tracks the reply. moves to next.
```

## setup

you need:

- **macos** (imessage runs on mac)
- **bun** (`curl -fsSL https://bun.sh/install | bash`)
- **full disk access** for your terminal (system settings → privacy & security → full disk access)
- **groq api key** (free at [console.groq.com](https://console.groq.com))

```bash
git clone https://github.com/YOUR_USERNAME/ghost-agent.git
cd ghost-agent
bun install
cp .env.example .env
# edit .env with your phone number and groq key
bun run start
```

## commands

text these to yourself while ghost is running:

| command | what it does |
|---------|-------------|
| `1` / `2` / `3` | send that draft reply |
| `ghost skip` | snooze 30 min, come back later |
| `ghost later` | same as skip |
| `ghost snooze 1h` | custom snooze time |
| `ghost dismiss` | skip permanently |
| `ghost status` | see unreplied messages |
| `ghost scan` | force a scan now |
| `ghost report` | relationship health report |
| `ghost [anything]` | chat naturally |

## architecture

```
ghost-agent/
├── src/
│   ├── agent.ts      # main loop, watcher, commands, conversational ai
│   ├── scanner.ts    # finds unreplied DMs using getUnreadMessages() + getMessages()
│   ├── drafter.ts    # ai reply drafting with voice matching
│   ├── priority.ts   # urgency detection
│   └── tracker.ts    # relationship health tracking
├── data/             # auto-created state
└── .env.example
```

### sdk usage

ghost uses the [@photon-ai/imessage-kit](https://github.com/photon-hq/imessage-kit) sdk pretty heavily:

- `sdk.getUnreadMessages()` — finds ghosted conversations grouped by sender
- `sdk.getMessages()` — pulls conversation context for voice matching
- `sdk.send()` — sends nudges to you and replies to contacts
- `sdk.startWatching()` — real-time command handling
- `sdk.listChats()` — bootstraps the relationship tracker
- `Reminders` — powers the snooze feature
- watcher config `excludeOwnMessages: false` — ghost needs to see your commands
- message fields like `isFromMe`, `isReaction`, `senderName` — filtering logic

**stack:** [photon imessage kit](https://github.com/photon-hq/imessage-kit) · [ai sdk](https://sdk.vercel.ai) · [groq](https://groq.com) · bun

## references

- [cdc adhd data](https://www.cdc.gov/ncbddd/adhd/data.html) — 15.5M adults with adhd in the US
- [r/ADHD](https://reddit.com/r/ADHD) — involuntary ghosting is everywhere on here
- [r/ADHDwomen](https://reddit.com/r/ADHDwomen) — texting guilt and relationship erosion
- [additude magazine](https://www.additudemag.com/) — executive dysfunction research
- [navia](https://joinnavia.com) — ai companion for the neurodivergent support cliff

---

built with [@photon-ai/imessage-kit](https://github.com/photon-hq/imessage-kit) for the [photon residency](https://photonhq.com/residency2).
