import { Line } from 'react-chartjs-2';

const OPTIONS = {
    maintainAspectRatio: false,
    scales: {
        x: { ticks: { color: '#4a4232', font: { size: 9 } }, grid: { color: 'rgba(42,36,22,0.5)' } },
        y: { min: 0, max: 100, ticks: { color: '#4a4232', font: { size: 9 }, callback: v => v + '%' }, grid: { color: 'rgba(42,36,22,0.5)' } },
    },
    plugins: { legend: { display: false }, datalabels: { display: false } },
};

function calcTrend(history) {
    const last = (history || []).slice(0, 10).reverse();
    let w = 0;
    return last.map((m, i) => { if (m.win) w++; return Math.round((w / (i + 1)) * 100); });
}

export default function TrendChartPanel({ h1, h2 }) {
    const t1 = calcTrend(h1);
    const t2 = calcTrend(h2);
    const len = Math.max(t1.length, t2.length) || 1;
    const labels = Array.from({ length: len }, (_, i) => `G${i + 1}`);

    const data = {
        labels,
        datasets: [
            { label: 'J1', data: t1, borderColor: '#f0a500', backgroundColor: 'rgba(240,165,0,0.06)', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#f0a500', tension: 0.4, fill: true },
            { label: 'J2', data: t2, borderColor: '#e84d00', backgroundColor: 'rgba(232,77,0,0.06)',  borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#e84d00', tension: 0.4, fill: true },
        ],
    };

    return (
        <div className="trend-box">
            <Line data={data} options={OPTIONS} />
        </div>
    );
}
