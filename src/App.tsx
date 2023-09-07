import { ContentGrid } from './components/ContentGrid';
import { mockContent } from './data/mockData';

export default function App() {
  return (
    <>
      <main>
        <h1 className="visually-hidden">Discover films, series, music, books and games</h1>
        <section className="results" aria-labelledby="results-title">
          <div className="results-head">
            <div>
              <h2 id="results-title">Browse tonight</h2>
              <p className="results-count">{mockContent.length} titles</p>
            </div>
          </div>

          <ContentGrid items={mockContent} />
        </section>
      </main>

      <footer className="site-footer">Nova Stream — a React + TypeScript frontend.</footer>
    </>
  );
}
