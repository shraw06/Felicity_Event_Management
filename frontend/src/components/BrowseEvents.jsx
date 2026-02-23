import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { eventAPI, organizerAPI, participantAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';

// BrowseEvents: fuzzy search + filters + Trending (Top 5/24h) sidebar
const BrowseEvents = () => {
    const navigate = useNavigate();

    const [originalEvents, setOriginalEvents] = useState([]); // master list
    const [events, setEvents] = useState([]); // displayed list
    const [organizers, setOrganizers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Filters
    const [selectedType, setSelectedType] = useState('all');
    const [eligibility, setEligibility] = useState('all'); // all | iiit_only | non_iiit
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [followedOnly, setFollowedOnly] = useState(false);
    const [followedOrgs, setFollowedOrgs] = useState([]);

    // Trending state
    const [trending, setTrending] = useState([]); // array of { event, count }

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [eventRes, orgRes, trendingRes] = await Promise.all([
                eventAPI.getAllEvents(),
                organizerAPI.getOrganizers(),
                eventAPI.getTrending(),
            ]);

            const eventsRaw = (eventRes && eventRes.data && eventRes.data.data) ? eventRes.data.data : [];
            const organizersList = (orgRes && orgRes.data && orgRes.data.data) ? orgRes.data.data : [];
            const trendingRaw = (trendingRes && trendingRes.data && trendingRes.data.data) ? trendingRes.data.data : [];

            // map organizers by id for quick lookup
            const orgMap = {};
            organizersList.forEach(o => { orgMap[o._id] = o; });

            // augment events with organizer metadata used by Fuse
            const eventsAug = eventsRaw.map(ev => {
                const org = orgMap[ev.organizer_id] || {};
                return {
                    ...ev,
                    organizer_name: org.first_name || org.email || '',
                    organizer_category: org.category || '',
                };
            });

            // augment trending entries with organizer info (trendingRaw elements are { event, count })
            const trendingAug = trendingRaw.map(t => {
                const ev = t.event || {};
                const org = orgMap[ev.organizer_id] || {};
                return {
                    event: { ...ev, organizer_name: org.first_name || org.email || '', organizer_category: org.category || '' },
                    count: t.count || 0,
                };
            });

            setOriginalEvents(eventsAug);
            setEvents(eventsAug);
            setOrganizers(organizersList);
            setTrending(trendingAug);
        } catch (err) {
            console.error('Failed to load events or organizers', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // load followed organizers from preferences (localStorage)
    // load participant preferences from backend (if logged in)
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const email = localStorage.getItem('participantEmail');
                if (!email) return;
                const res = await participantAPI.getParticipant(email);
                if (!mounted) return;
                if (res && res.data && res.data.data) {
                    const p = res.data.data;
                    const prefs = p.preferences || {};
                    // store areas and following
                    if (Array.isArray(prefs.areas)) {
                        // normalize strings
                        setFollowedOrgs(prev => prev);
                        // we'll use participantPrefs for ordering
                    }
                    setFollowedOrgs(Array.isArray(prefs.following) ? prefs.following.map(String) : []);
                    setParticipantPrefs(prefs);
                }
            } catch (err) {
                // ignore
            }
        })();
        return () => { mounted = false; };
    }, []);

    const [participantPrefs, setParticipantPrefs] = useState(null);

    // create fuse index
    const fuse = useMemo(() => new Fuse(originalEvents, {
        keys: ['name', 'organizer_name', 'type', 'event_tags'],
        threshold: 0.4,
        distance: 100,
        minMatchCharLength: 1,
        includeScore: true,
    }), [originalEvents]);

    // combined search + filters effect
    useEffect(() => {
        let working = originalEvents.slice();

        // search
        if (searchTerm) {
            try {
                const results = fuse.search(searchTerm);
                working = results.map(r => r.item);
            } catch (err) {
                console.error('Search error', err);
            }
        }

        // type filter
        if (selectedType && selectedType !== 'all') {
            working = working.filter(ev => String(ev.type || '').toLowerCase() === String(selectedType).toLowerCase());
        }

        // eligibility
        if (eligibility === 'iiit_only') {
            working = working.filter(ev => ev.non_iiit_eligibility === false || typeof ev.non_iiit_eligibility === 'undefined');
        } else if (eligibility === 'non_iiit') {
            working = working.filter(ev => ev.non_iiit_eligibility === true);
        }

        // date range (inclusive overlap)
        if (dateFrom) {
            const from = new Date(dateFrom);
            working = working.filter(ev => new Date(ev.event_end_date) >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo);
            working = working.filter(ev => new Date(ev.event_start_date) <= to);
        }

        // followed-only
        if (followedOnly) {
            working = working.filter(ev => followedOrgs.includes(String(ev.organizer_id)));
        }

        // If participant preferences exist, score events to favor matches
        if (participantPrefs) {
            const areas = Array.isArray(participantPrefs.areas) ? participantPrefs.areas.map(a => String(a).toLowerCase()) : [];
            const following = Array.isArray(participantPrefs.following) ? participantPrefs.following.map(String) : [];

            const scored = working.map(ev => {
                let score = 0;
                // tag/area match
                const tags = Array.isArray(ev.event_tags) ? ev.event_tags.map(t => String(t).toLowerCase()) : [];
                const tagMatches = tags.filter(t => areas.includes(t)).length;
                score += tagMatches * 10;
                // organizer followed
                if (following.includes(String(ev.organizer_id))) score += 5;
                // prefer events starting sooner
                const start = ev.event_start_date ? new Date(ev.event_start_date).getTime() : Infinity;
                return { ev, score, start };
            });

            scored.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.start - b.start;
            });
            setEvents(scored.map(s => s.ev));
            return;
        }

        setEvents(working);
    }, [searchTerm, fuse, originalEvents, selectedType, eligibility, dateFrom, dateTo, followedOnly, followedOrgs, participantPrefs]);

    const onReset = () => {
        setSelectedType('all');
        setEligibility('all');
        setDateFrom('');
        setDateTo('');
        setFollowedOnly(false);
        setSearchTerm('');
    };

    return (
        <div style={{ padding: 12 }}>
            <h2>Browse Events</h2>

            {/* Filters row */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
                <input
                    placeholder="Search events or organizers..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ padding: 8, minWidth: 240 }}
                />

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
                    Type
                    <select value={selectedType} onChange={e => setSelectedType(e.target.value)} style={{ padding: 6 }}>
                        <option value="all">All</option>
                        {Array.from(new Set(originalEvents.map(ev => ev.type).filter(Boolean))).map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
                    Eligibility
                    <select value={eligibility} onChange={e => setEligibility(e.target.value)} style={{ padding: 6 }}>
                        <option value="all">All</option>
                        <option value="iiit_only">IIIT only</option>
                        <option value="non_iiit">Non-IIIT allowed</option>
                    </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
                    From
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: 6 }} />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
                    To
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: 6 }} />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={followedOnly} onChange={e => setFollowedOnly(e.target.checked)} />
                    Show only followed clubs
                </label>

                <button onClick={onReset} style={{ padding: '6px 10px' }}>Reset</button>
            </div>

            {/* Main grid: results + trending */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18 }}>
                <div>
                    {loading ? (
                        <div>Loading events...</div>
                    ) : events.length === 0 ? (
                        <div style={{ padding: 20, background: '#f8f9fa', borderRadius: 6 }}>No events found.</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                            {events.map(ev => (
                                <div key={ev._id} style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <strong>{ev.name}</strong>
                                        <span style={{ fontSize: 12, color: '#666' }}>{ev.status}</span>
                                    </div>
                                    <div style={{ fontSize: 13, color: '#555', marginTop: 6 }}>{ev.description?.slice(0, 120)}</div>
                                    <div style={{ marginTop: 8, fontSize: 13, color: '#333' }}>
                                        Organizer: {ev.organizer_name || '—'} {ev.organizer_category ? `· ${ev.organizer_category}` : ''}
                                    </div>
                                                        <div style={{ marginTop: 12 }}>
                                                            <button onClick={() => navigate(`/events/${ev._id}`)} style={{ padding: '6px 10px' }}>View</button>
                                                        </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sidebar: Trending */}
                <aside style={{ border: '1px solid #eee', padding: 12, borderRadius: 8, background: '#fff' }}>
                    <h3 style={{ marginTop: 0 }}>Trending (Top 5/24h)</h3>
                    {trending.length === 0 ? (
                        <div style={{ color: '#666' }}>No trending events in the last 24 hours.</div>
                    ) : (
                        <ol style={{ paddingLeft: 16, marginTop: 8 }}>
                            {trending.map((t, idx) => (
                                <li key={(t.event && t.event._id) || idx} style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 600 }}>{t.event?.name || 'Untitled'}</div>
                                    <div style={{ fontSize: 13, color: '#555' }}>{t.event?.organizer_name || ''} · {t.count} registration{t.count !== 1 ? 's' : ''}</div>
                                    <div style={{ marginTop: 6 }}>
                                        <button onClick={() => navigate(`/events/${t.event._id}`)} style={{ padding: '6px 8px' }}>View</button>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </aside>
            </div>
        </div>
    );
};

export default BrowseEvents;
