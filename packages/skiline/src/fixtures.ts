// Fully synthetic data in the documented getData shape. Ids, names and numbers are
// invented; nothing here comes from a real account.
const day = (
  id: string,
  date: string,
  resortId: string,
  stats: { vertical: number; lifts: number; slope: number },
) => ({
  id,
  date,
  resortId,
  ticketId: 'T-1',
  data: JSON.stringify({
    verticalMeters: stats.vertical,
    liftCount: stats.lifts,
    slopeDistance: stats.slope,
    graphData: [
      [0, 1700],
      [3600, 2100],
      [7200, 1700],
    ],
    minX: 0,
    maxX: 7200,
    minY: 1700,
    maxY: 2100,
  }),
});

export function syntheticExport() {
  return {
    items: [],
    tickets: [{ id: 'T-1' }],
    resorts: [
      { id: '9001', name: 'Beispielgebiet Nord' },
      { id: '9002', name: 'Beispielgebiet Süd' },
    ],
    skiingDays: [
      day('d-1', '2027-01-10', '9001', {
        vertical: 12450,
        lifts: 18,
        slope: 42300,
      }),
      day('d-2', '2027-01-11', '9001', {
        vertical: 9800,
        lifts: 15,
        slope: 31000,
      }),
      day('d-3', '2027-01-12T09:00:00+01:00', '9002', {
        vertical: 15100,
        lifts: 22,
        slope: 51200,
      }),
    ],
    seasonStatistic: { days: 3 },
    user: { displayName: 'Beispielnutzer' },
  };
}
