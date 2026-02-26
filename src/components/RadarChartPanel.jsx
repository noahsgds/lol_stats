import { Radar } from 'react-chartjs-2';

const KEYS = ['avg_damage', 'avg_damage_taken', 'avg_gold', 'avg_vision', 'avg_cs'];
const LABELS = ['Dégâts', 'Tanking', 'Gold', 'Vision', 'Farm'];

const EMPTY_DATA = {
    labels: LABELS,
    datasets: [
        { label: 'J1', data: [0, 0, 0, 0, 0], borderColor: '#f0a500', backgroundColor: 'rgba(240,165,0,0.1)', borderWidth: 2, pointBackgroundColor: '#f0a500', pointRadius: 4 },
        { label: 'J2', data: [0, 0, 0, 0, 0], borderColor: '#e84d00', backgroundColor: 'rgba(232,77,0,0.1)',  borderWidth: 2, pointBackgroundColor: '#e84d00', pointRadius: 4 },
    ],
};

const OPTIONS = {
    maintainAspectRatio: false,
    scales: {
        r: {
            min: 0, max: 100,
            grid:        { color: 'rgba(42,36,22,0.9)' },
            angleLines:  { color: 'rgba(42,36,22,0.9)' },
            pointLabels: { color: '#9a8d72', font: { family: 'Barlow Condensed', size: 12, weight: '700' } },
            ticks:       { display: false },
        },
    },
    plugins: { legend: { display: false }, datalabels: { display: false } },
};

export default function RadarChartPanel({ g1, g2 }) {
    let data = EMPTY_DATA;
    if (g1 && g2) {
        const maxes = KEYS.map(k => Math.max(parseFloat(g1[k]) || 0, parseFloat(g2[k]) || 0));
        const d1 = KEYS.map((k, i) => maxes[i] ? Math.round(((parseFloat(g1[k]) || 0) / maxes[i]) * 100) : 0);
        const d2 = KEYS.map((k, i) => maxes[i] ? Math.round(((parseFloat(g2[k]) || 0) / maxes[i]) * 100) : 0);
        data = {
            labels: LABELS,
            datasets: [
                { label: 'J1', data: d1, borderColor: '#f0a500', backgroundColor: 'rgba(240,165,0,0.1)', borderWidth: 2, pointBackgroundColor: '#f0a500', pointRadius: 4, pointHoverRadius: 6 },
                { label: 'J2', data: d2, borderColor: '#e84d00', backgroundColor: 'rgba(232,77,0,0.1)',  borderWidth: 2, pointBackgroundColor: '#e84d00', pointRadius: 4, pointHoverRadius: 6 },
            ],
        };
    }
    return (
        <div className="radar-box">
            <Radar data={data} options={OPTIONS} />
        </div>
    );
}
