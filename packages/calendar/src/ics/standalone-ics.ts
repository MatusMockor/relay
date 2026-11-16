import ICAL from 'ical.js';

type Component = InstanceType<typeof ICAL.Component>;

export const PRODID = '-//Relay//Calendar 1.0//SK';

const zoneIdsOf = (vevent: Component): Set<string> => {
  const ids = new Set<string>();
  for (const property of vevent.getAllProperties()) {
    const tzid: unknown = property.getParameter('tzid');
    if (typeof tzid === 'string') {
      ids.add(tzid);
    }
  }
  return ids;
};

const zonesFor = (calendar: Component, ids: Set<string>): Component[] =>
  calendar.getAllSubcomponents('vtimezone').filter((zone) => {
    const tzid: unknown = zone.getFirstPropertyValue('tzid');
    return typeof tzid === 'string' && ids.has(tzid);
  });

export const newCalendar = (method: string | null): Component => {
  const calendar = new ICAL.Component('vcalendar');
  calendar.addPropertyWithValue('prodid', PRODID);
  calendar.addPropertyWithValue('version', '2.0');
  if (method !== null) {
    calendar.addPropertyWithValue('method', method);
  }
  return calendar;
};

export const jcalOf = (value: { toJSON(): unknown }): unknown[] => {
  const json: unknown = structuredClone(value.toJSON());
  return Array.isArray(json) ? json : [];
};

export const cloneComponent = (component: Component): Component =>
  new ICAL.Component(jcalOf(component));

export const standaloneIcs = (calendar: Component, vevent: Component): string => {
  const single = newCalendar(null);
  for (const zone of zonesFor(calendar, zoneIdsOf(vevent))) {
    single.addSubcomponent(cloneComponent(zone));
  }
  single.addSubcomponent(cloneComponent(vevent));
  return single.toString();
};

export const parseCalendar = (text: string): Component | null => {
  try {
    const jcal: unknown = ICAL.parse(text);
    if (!Array.isArray(jcal)) {
      return null;
    }
    const first: unknown = jcal[0];
    const root: unknown = typeof first === 'string' ? jcal : first;
    if (!Array.isArray(root)) {
      return null;
    }
    const component = new ICAL.Component(root);
    return component.name === 'vcalendar' ? component : null;
  } catch {
    return null;
  }
};
