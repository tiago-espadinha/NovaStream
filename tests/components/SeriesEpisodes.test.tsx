// @vitest-environment jsdom
import '../helpers/dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeriesEpisodes } from '../../src/screens/detail/SeriesEpisodes';
import * as api from '../../src/services/apiService';
import { ApiError } from '../../src/services/apiService';
import type { SeasonEpisodes, SeasonSummary } from '../../src/types';
import { deferred } from '../helpers/fixtures';

vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  getTvSeason: vi.fn(),
}));

const getTvSeason = vi.mocked(api.getTvSeason);

const seasons: SeasonSummary[] = [
  { number: 1, name: null, episodeCount: 2 },
  { number: 2, name: 'The Return', episodeCount: 1 },
];
const season = (number: number, title: string): SeasonEpisodes => ({
  number,
  name: `Season ${number}`,
  episodes: [{ number: 1, title, airDate: null }],
});

const picker = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Season' });
const episodes = (props = seasons) => render(<SeriesEpisodes externalId="42" seasons={props} />);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SeriesEpisodes', () => {
  it('renders nothing for a series with no seasons', () => {
    const { container } = episodes([]);
    expect(container.firstChild).toBeNull();
    expect(getTvSeason).not.toHaveBeenCalled();
  });

  it('loads the first season with a spinner, then lists its episodes', async () => {
    getTvSeason.mockResolvedValue(season(1, 'Pilot'));
    episodes();
    expect(screen.getByText('Loading episodes…')).toBeTruthy();
    expect(getTvSeason).toHaveBeenCalledWith('42', 1);

    expect(await screen.findByRole('list', { name: 'Season 1 episodes' })).toBeTruthy();
    expect(screen.getByText('Pilot')).toBeTruthy();
  });

  it('labels each option with its season and episode count', async () => {
    getTvSeason.mockResolvedValue(season(1, 'Pilot'));
    episodes();
    await screen.findByText('Pilot');
    expect([...picker().options].map(({ textContent }) => textContent)).toEqual([
      'Season 1 · 2 episodes',
      'The Return · 1 episode',
    ]);
  });

  it('fetches a season the first time only', async () => {
    getTvSeason.mockResolvedValueOnce(season(1, 'Pilot')).mockResolvedValueOnce(season(2, 'Comeback'));
    episodes();
    await screen.findByText('Pilot');

    fireEvent.change(picker(), { target: { value: '2' } });
    await screen.findByText('Comeback');
    expect(getTvSeason).toHaveBeenLastCalledWith('42', 2);

    fireEvent.change(picker(), { target: { value: '1' } });
    expect(screen.getByText('Pilot')).toBeTruthy();
    expect(getTvSeason).toHaveBeenCalledTimes(2);
  });

  it('a late answer for a season the viewer has left stays out of the list', async () => {
    const slow = deferred<SeasonEpisodes>();
    getTvSeason.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(season(2, 'Comeback'));
    episodes();
    fireEvent.change(picker(), { target: { value: '2' } });
    await screen.findByText('Comeback');

    await act(async () => slow.resolve(season(1, 'Pilot')));
    expect(screen.queryByText('Pilot')).toBeNull();
    expect(screen.getByText('Comeback')).toBeTruthy();
  });

  it('says when a season has no episodes yet', async () => {
    getTvSeason.mockResolvedValue({ ...season(1, 'x'), episodes: [] });
    episodes();
    expect(await screen.findByText('No episodes listed for this season yet.')).toBeTruthy();
  });

  it('retries a failed season, with focus kept on the picker', async () => {
    getTvSeason.mockRejectedValueOnce(new ApiError(504, 'slow', 'timeout'));
    episodes();
    expect((await screen.findByRole('alert')).textContent).toContain('The episode list took too long to load.');

    getTvSeason.mockResolvedValueOnce(season(1, 'Pilot'));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(document.activeElement).toBe(picker());
    expect(await screen.findByText('Pilot')).toBeTruthy();
  });

  it('offers no retry when the season does not exist', async () => {
    getTvSeason.mockRejectedValue(new ApiError(404, 'gone', 'not_found'));
    episodes();
    await screen.findByText('There’s no episode list for this season.');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('picking another season clears the error', async () => {
    getTvSeason.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce(season(2, 'Comeback'));
    episodes();
    await screen.findByRole('alert');

    fireEvent.change(picker(), { target: { value: '2' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await screen.findByText('Comeback')).toBeTruthy();
  });
});
