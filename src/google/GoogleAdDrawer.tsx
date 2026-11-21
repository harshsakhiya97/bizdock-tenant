import { ExternalLink } from 'lucide-react'
import { Drawer } from '@/components/Drawer'
import { cn } from '@/lib/cn'
import { googleAdsUrl, gTone, gWord, type GAd } from './api'

/** a Google ad: Google has no ready preview like Facebook's, so its words: headlines, descriptions and where it leads */
export function GoogleAdDrawer({ ad, sub, customerId, onClose }: { ad: GAd; sub: string; customerId?: string | null; onClose: () => void }) {
  return (
    <Drawer open onClose={onClose} width={560} title={ad.name || ad.headlines[0] || `Ad ${ad.ad_id}`}>
      <div className="stack">
        <div className="muted small">{sub}</div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className={cn('badge', gTone(ad.status))}>{gWord(ad.status)}</span>
          {ad.type && <span className="badge badge-muted">{gWord(ad.type)}</span>}
          <a className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} href={googleAdsUrl(customerId, ad.campaign_id, ad.ad_group_id)} target="_blank" rel="noopener noreferrer">
            Open in Google Ads <ExternalLink size={12} />
          </a>
        </div>
        {/* how a search ad reads: the first headlines, the address, the first description */}
        {ad.headlines.length > 0 && (
          <div className="card card-pad g-ad">
            <div className="muted small">Sponsored</div>
            {ad.final_urls[0] && <div className="g-ad-url">{ad.final_urls[0].replace(/^https?:\/\//, '').replace(/\/$/, '')}</div>}
            <div className="g-ad-head">{ad.headlines.slice(0, 3).join(' | ')}</div>
            {ad.descriptions[0] && <div className="g-ad-desc">{ad.descriptions.slice(0, 2).join(' ')}</div>}
          </div>
        )}
        {ad.headlines.length > 0 && (
          <div>
            <b>Headlines ({ad.headlines.length})</b>
            <ol className="g-ad-list">
              {ad.headlines.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ol>
          </div>
        )}
        {ad.descriptions.length > 0 && (
          <div>
            <b>Descriptions ({ad.descriptions.length})</b>
            <ol className="g-ad-list">
              {ad.descriptions.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ol>
          </div>
        )}
        {ad.final_urls.length > 0 && (
          <div>
            <b>Leads to</b>
            {ad.final_urls.map((u) => (
              <div key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="link-btn">
                  {u} <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </div>
        )}
        {!ad.headlines.length && !ad.descriptions.length && <div className="muted small">Google doesn’t share the words of this kind of ad (image, video or Performance Max assets).</div>}
      </div>
    </Drawer>
  )
}
