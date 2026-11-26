import { sampleWeather, timePeriod } from './climate.js';

const remarks = [
  { id: 'crab', title: 'Crab Gossip', expression: 'smug',
    text: 'A crab stole my best shell. I asked for it back, and it walked sideways out of the conversation.' },
  { id: 'turtles', title: 'A Turtle Fact', expression: 'thinking',
    text: 'Sea turtles breathe air. They venture up for a breath, then dive again. I come up for gossip, myself.' },
  { id: 'tide', title: 'The Tide Comes In', expression: 'mysterious',
    text: 'The moon helps pull the tides. I tried looking sternly at the sea once. The moon has a knack I lack.' },
  { id: 'gull', title: 'A Fowl Bargain', expression: 'laughing',
    text: 'A gull once offered to guard my lunch. It kept its word for nearly a whole second.' },
  { id: 'moth', title: 'The Lantern Keeper', expression: 'happy',
    text: 'We used to light a lantern for anyone coming home late. The moths always arrived first. Very punctual, moths.' },
  { id: 'sand', title: 'A Grain of Truth', expression: 'thinking',
    text: 'Some beaches get their sand from rocks worn down grain by grain. The sea has remarkable patience and very little else on its calendar.' },
  { id: 'fern', title: 'An Old Acquaintance', expression: 'smug',
    text: 'I used to tell the ferns my secrets. They kept them beautifully until I started repeating myself.' },
  { id: 'checking-in', title: 'Just Checking In', expression: 'happy',
    text: 'How are you holding up? I was going to offer advice, but I think I might just sit here with you a moment.' },
  { id: 'pebble', title: 'Guardian Duties', expression: 'proud',
    text: 'I spent an entire afternoon guarding a pebble once. It was still there at sunset. A flawless day of work.' },
  { id: 'village', title: 'The Sound of Home', expression: 'happy',
    text: 'I like hearing footsteps here again. Even when someone tracks sand somewhere they ought not to.' },
  { id: 'rain', title: 'A Passing Shower', expression: 'smug', when: ({ rain }) => rain >= 0.12 && rain < 0.7,
    text: 'The best thing about being a spirit is that rain goes straight through me. The worst is that I still forget and duck.' },
  { id: 'night', title: 'Night Watch', expression: 'sleepy', when: ({ period }) => period === 'night',
    text: 'I promised to keep watch tonight. If my eyes close, I am listening very, very carefully.' },
];

export function createAuronCheckIns(random = Math.random) {
  let remaining;

  function reset() {
    remaining = 90 + random() * 60;
  }
  reset();

  return {
    reset,
    update(dt, state, show) {
      remaining -= dt;
      if (remaining > 0) return;
      const context = {
        period: timePeriod(state.time.minutes),
        rain: sampleWeather(state.weather, state.time.seconds).rain,
      };
      const eligible = remarks.filter(remark => !remark.when || remark.when(context));
      const heard = Array.isArray(state.story.auronRemarks) ? state.story.auronRemarks : [];
      const fresh = eligible.filter(remark => !heard.includes(remark.id));
      const pool = fresh.length ? fresh : eligible.filter(remark => remark.id !== heard.at(-1));
      const { id, title, expression, text } = pool[Math.floor(random() * pool.length)];
      if (show({ id: 'auron_check_in', mode: 'ambient', pauseWorld: false, beats: [{ title, expression, text }] })) {
        state.story.auronRemarks = [...(fresh.length ? heard : []), id];
        remaining = 240 + random() * 180;
      }
    },
  };
}

const intro = [
  ['mysterious', 'Once, this island was bright with lanterns and loud with laughter. Then the lights went out. The sea kept its secrets.'],
  ['sleepy', 'Centuries of quiet. A splendid nap, if you overlook the centuries.'],
  ['happy', 'Wait. Footprints! People have come back at last!'],
  ['surprised', 'One… two. Two strangers. That is a very small invasion.'],
  ['thinking', 'Hold on. You can hear me? The two on the beach can’t. My name is Auron. I look after this island, when it lets me.'],
  ['sad', 'I used to keep its fires lit. These days I can barely warm a pebble. I could use your help.'],
  ['proud', 'Guide the two survivors. A village has to start somewhere. This one starts with supper.'],
];

export function buildAuronSequence(id, { food, wood, camp, village } = {}) {
  switch (id) {
    case 'intro_arrival': return {
      id, mode: 'story', pauseWorld: true, followUp: 'tutorial_food', followOnSkip: true,
      beats: intro.map(([expression, text], index) => ({
        title: 'The Island Awakens', expression, text,
        focus: index === 0 ? camp : index === 2 ? village : undefined,
      })),
    };
    case 'tutorial_food': return {
      id, mode: 'guide', followUp: 'tutorial_resources',
      beats: [{
        title: 'Something to Eat', expression: 'happy', icon: 'hunger',
        text: 'Those berries look promising. Drop one of the villagers by the bush and let them bring supper back to camp.',
        focus: food || camp, beaconLabel: 'Gather Berries', dragFrom: 'adult',
        waitFor: w => w.state.villagers.some(v => v.preferredJob?.job === 'gather' || v.work?.job === 'gather'),
      }],
    };
    case 'tutorial_resources': return {
      id, mode: 'guide',
      beats: [{
        title: 'Wood for the Fire', expression: 'thinking', icon: 'work',
        text: 'Now send an adult to chop wood. Bring four logs to the stone fire ring. A warm supper beats a cold one.',
        focus: wood || camp, beaconLabel: 'Chop Wood', dragFrom: 'adult',
      }],
    };
    case 'tutorial_shelter': return {
      id, mode: 'guide',
      beats: [{
        title: 'A Roof Overhead', expression: 'smug', icon: 'build',
        text: 'Place a House from Buildings, then send an adult to build it. Rain has a terrible sense of timing.',
        action: { type: 'open-menu', arg: 'buildings', label: 'Buildings' },
      }],
    };
    case 'tutorial_care': return {
      id, mode: 'guide',
      beats: [
        { title: 'Keep an Eye on Them', expression: 'worried', icon: 'health',
          text: 'With only two people, each one matters. Check their needs and keep food at camp so they can eat and rest.' },
        { title: 'A Little Curiosity', expression: 'thinking', icon: 'research',
          text: 'Send an adult to study at the lit campfire. They’ll earn Knowledge you can spend on new skills.',
          focus: camp, beaconLabel: 'Study at the Fire', action: { type: 'open-menu', arg: 'research', label: 'Research' } },
      ],
    };
    case 'tutorial_low_food': return {
      id, mode: 'guide', tone: 'danger',
      beats: [{ title: 'Supplies Are Low', expression: 'worried', icon: 'hunger', text: 'Look in the food stores. An empty basket is a poor dinner guest. Send someone to gather more.',
        focus: food || camp, beaconLabel: 'Gather Food' }],
    };
    case 'tutorial_mystery': return {
      id, mode: 'choice',
      beats: [
        { title: 'Something Beneath the Vines', expression: 'mysterious', text: 'There are marks on the old stones that even the sea couldn’t wash away. Curious?',
          choices: [{ id: 'listen', label: 'Tell me', next: 1 }, { id: 'later', label: 'Maybe later' }] },
        { title: 'Something Beneath the Vines', expression: 'sad', text: 'I used to know who carved them. I remember the sound of their chisels. The names will come back to me, I hope.' },
      ],
    };
    default: return null;
  }
}
