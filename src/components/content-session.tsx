// The bespoke content session, when one has been agreed. Optional: most
// proposals won't have one, and the section simply doesn't render.
import { speakerRole, type ContentSession as Session } from '@/lib/types';

const EVENT_LABEL: Record<string, string> = {
  london: 'London',
  asia: 'Asia',
  nyc: 'New York',
};

export function ContentSessionSection({
  session,
  accent,
  nested,
}: {
  session: Session | null;
  accent: string;
  /** Rendered inside a city's group, which already supplies the heading
   *  chrome and names the city — so drop both here. */
  nested?: boolean;
}) {
  if (!session?.heading) return null;

  const Wrapper = nested ? 'div' : 'section';

  return (
    <Wrapper className={nested ? 'mt-8' : 'mx-auto max-w-6xl px-10 py-16'}>
      <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>
        Content Session
        {!nested && session.event && (
          <span className="ml-2 text-neutral-400">{EVENT_LABEL[session.event] ?? session.event}</span>
        )}
      </h2>

      <div className="pdf-block mt-4 border border-neutral-200 bg-white px-8 py-8">
        <h3 className="max-w-3xl text-3xl font-bold tracking-tight">{session.heading}</h3>
        {session.description && (
          <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-neutral-700">
            {session.description}
          </p>
        )}
        {session.title && (
          <p className="mt-6 max-w-2xl text-lg italic text-neutral-700">
            Title: {session.title}
          </p>
        )}

        {session.speakers?.length > 0 && (
          <>
            <div className="mt-8 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Speakers
            </div>
            <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {session.speakers.map((speaker, i) => (
                <li key={`${speaker.name}-${i}`} className="flex items-center gap-4">
                  {speaker.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={speaker.photo}
                      alt=""
                      className="h-16 w-16 shrink-0 object-cover"
                    />
                  ) : (
                    // A neutral block keeps the row aligned with its
                    // neighbours when a headshot hasn't been supplied.
                    <div className="h-16 w-16 shrink-0 bg-neutral-100" aria-hidden />
                  )}
                  <div>
                    <div className="font-semibold text-neutral-900">{speaker.name}</div>
                    {speakerRole(speaker) && (
                      <div className="text-sm text-neutral-500">{speakerRole(speaker)}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Wrapper>
  );
}
