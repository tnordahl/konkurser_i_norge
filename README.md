# Konkurser i Norge

A comprehensive system for monitoring Norwegian bankruptcies with intelligent data fetching, SWR caching, and automated daily updates.

## Features

- **🏛️ Municipality-based tracking**: Monitor bankruptcies by Norwegian municipalities (kommuner)
- **📊 Intelligent data gaps detection**: Automatically identifies and fills missing data periods
- **⚡ SWR for performance**: Real-time data fetching with caching and background updates
- **🕐 Automated daily updates**: Scheduled data synchronization every day at 2 AM
- **📱 Real-time UI updates**: Live data updates without page refreshes
- **🎯 Smart data coverage**: Tracks data completeness and coverage statistics
- **🔧 Admin dashboard**: Manage data updates and scheduler from web interface

## Architecture

### Data Fetching Strategy

- **One year lookback**: Maintains data from one year ago until today
- **Gap detection**: Intelligently identifies missing data periods
- **Incremental updates**: Only fetches missing data, not duplicates
- **External API integration**: Ready for Norwegian bankruptcy registry APIs

### Performance Optimizations

- **SWR caching**: 5-minute cache with background revalidation
- **Incremental loading**: Loads data as needed per municipality
- **Background updates**: Non-blocking data synchronization
- **Error resilience**: Automatic retry with exponential backoff

## Setup

### Prerequisites

- Node.js 18+ or Bun
- Sanity CMS account
- Git

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/tnordahl/konkurser_i_norge.git
cd konkurser_i_norge
```

2. **Install dependencies**

```bash
bun install
# or
npm install
```

3. **Environment Configuration**
   Create a `.env.local` file with the following variables:

```env
# Sanity CMS Configuration
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2024-01-01
SANITY_API_TOKEN=your_sanity_api_token_with_write_permissions

# Scheduler Configuration
ENABLE_SCHEDULER=false  # Set to true in production
CRON_SECRET=your_cron_secret_token

# Monitoring (optional)
MONITORING_WEBHOOK_URL=https://your-monitoring-service.com/webhook

# Norwegian Bankruptcy Registry API (when available)
BANKRUPTCY_API_URL=https://api.example.com/bankruptcies
BANKRUPTCY_API_KEY=your_api_key
```

4. **Set up Sanity CMS**

```bash
# Navigate to Sanity Studio
cd sanity-studio  # If you have a separate studio setup
# or access the studio at /studio route in your app

# Deploy Sanity schemas
npx sanity deploy
```

5. **Start the development server**

```bash
bun dev
# or
npm run dev
```

The application will be available at `http://localhost:3000`.

## Usage

### Viewing Municipality Data

1. Navigate to `/kommuner` to see all municipalities
2. Click on a specific municipality to view detailed bankruptcy data
3. Use the "Oppdater data" button to manually trigger data updates for that municipality

### Admin Dashboard

1. Navigate to `/admin/data-management` to access the admin panel
2. Monitor scheduler status and trigger manual updates
3. View data coverage statistics and update history

### API Endpoints

- `GET /api/kommune/[id]` - Get bankruptcy data for a specific municipality
- `POST /api/kommune/[id]` - Trigger data update for a municipality
- `GET /api/data-gaps/[id]` - Get data coverage statistics for a municipality
- `POST /api/update-all` - Trigger full system update (all municipalities)
- `GET /api/scheduler` - Get scheduler status
- `POST /api/scheduler` - Control scheduler (start/stop/trigger)

## Data Flow

1. **Scheduled Updates**: Every day at 2 AM (Norwegian time)
2. **Gap Detection**: System calculates missing data periods for each municipality
3. **External API Calls**: Fetches missing data from bankruptcy registries
4. **Data Storage**: Saves new bankruptcy records to Sanity CMS
5. **Cache Invalidation**: SWR automatically updates cached data
6. **UI Updates**: Real-time updates in the user interface

## Monitoring

The system includes built-in monitoring capabilities:

- **Update Success/Failure Tracking**: Logs all data update attempts
- **Data Coverage Statistics**: Tracks completeness of data for each municipality
- **Performance Metrics**: Monitors API response times and cache hit rates
- **Error Handling**: Automatic retry logic with exponential backoff

## Development

### Project Structure

```
├── app/
│   ├── (web)/                 # Main web application
│   │   ├── admin/             # Admin dashboard
│   │   ├── kommune/[id]/      # Municipality detail pages
│   │   └── kommuner/          # Municipality list
│   └── api/                   # API routes
├── lib/
│   ├── data-fetcher.ts        # Core data fetching logic
│   ├── hooks/                 # SWR hooks
│   ├── scheduler.ts           # Cron job management
│   └── sanity.ts             # Sanity client
├── components/
│   ├── providers/            # React providers (SWR)
│   └── ui/                   # UI components
└── sanity/
    └── schemas/              # Sanity CMS schemas
```

### Adding New Data Sources

To integrate with additional bankruptcy registries:

1. **Update the fetcher**: Modify `fetchBankruptcyDataFromExternalAPI` in `lib/data-fetcher.ts`
2. **Add API configuration**: Include new API endpoints in environment variables
3. **Update schemas**: Extend Sanity schemas if additional fields are needed
4. **Test data flow**: Use the admin dashboard to test new integrations

### Customizing Update Schedule

The default schedule runs at 2 AM daily. To modify:

1. Edit the cron expression in `lib/scheduler.ts`
2. Update the `startDailyUpdateScheduler` function
3. Restart the application or use the admin dashboard to restart the scheduler

## Production Deployment

### Environment Variables

Set the following in production:

- `ENABLE_SCHEDULER=true` - Enables automatic daily updates
- `NODE_ENV=production` - Optimizes performance
- `CRON_SECRET` - Secure token for webhook-based updates

### Monitoring Setup

- Configure `MONITORING_WEBHOOK_URL` for external monitoring
- Set up log aggregation for error tracking
- Monitor API rate limits and adjust accordingly

### Performance Considerations

- SWR cache is optimized for 5-minute intervals
- Database queries are optimized for municipality-based filtering
- Consider CDN caching for static assets

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions and support:

- Create an issue in the GitHub repository
- Check the admin dashboard for system status
- Review logs for debugging information
-
