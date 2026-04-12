import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { NextResponse } from 'next/server';
import { subDays, format, parseISO, differenceInDays } from 'date-fns';

// Initialize the client lazily to avoid crashing if env vars are missing
let analyticsClient: BetaAnalyticsDataClient | null = null;

function getAnalyticsClient() {
  if (!analyticsClient) {
    const propertyId = process.env.GA4_PROPERTY_ID;
    const serviceAccountKey = process.env.GA4_SERVICE_ACCOUNT_KEY;

    if (!propertyId || !serviceAccountKey) {
      return null;
    }

    try {
      const credentials = JSON.parse(serviceAccountKey);
      analyticsClient = new BetaAnalyticsDataClient({
        credentials,
      });
    } catch (error) {
      console.error('Failed to initialize GA4 client:', error);
      return null;
    }
  }
  return analyticsClient;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') || format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const endDate = searchParams.get('endDate') || format(new Date(), 'yyyy-MM-dd');
  const propertyId = process.env.GA4_PROPERTY_ID;

  const client = getAnalyticsClient();

  if (!client || !propertyId) {
    return NextResponse.json({ error: 'Google Analytics not configured' }, { status: 503 });
  }

  try {
    // Calculate previous period for comparison
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const daysDiff = differenceInDays(end, start) + 1;
    const prevStartDate = format(subDays(start, daysDiff), 'yyyy-MM-dd');
    const prevEndDate = format(subDays(start, 1), 'yyyy-MM-dd');

    const dimensionFilter = {
      filter: {
        fieldName: 'hostName',
        stringFilter: {
          value: 'lp.cafeitaoca.com.br',
          matchType: 'EXACT',
        },
      },
    };

    // 1. Sessions and New vs Returning
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        { startDate, endDate },
        { startDate: prevStartDate, endDate: prevEndDate },
      ],
      dimensions: [{ name: 'newVsReturning' }],
      metrics: [{ name: 'sessions' }],
      dimensionFilter,
    });

    // 2. Sessions by Device
    const [deviceResponse] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
      dimensionFilter,
    });

    // 3. Sessions by Channel (Organic vs Direct)
    const [channelResponse] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      dimensionFilter,
    });

    // 4. Daily Sessions for Chart
    const [dailyResponse] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      dimensionFilter,
    });

    // Process Data
    const currentSessions = response.rows
      ?.filter(row => row.dimensionValues?.[1]?.value === 'date_range_0')
      .reduce((acc, row) => acc + Number(row.metricValues?.[0]?.value || 0), 0) || 0;
    
    const prevSessions = response.rows
      ?.filter(row => row.dimensionValues?.[1]?.value === 'date_range_1')
      .reduce((acc, row) => acc + Number(row.metricValues?.[0]?.value || 0), 0) || 0;

    const sessionsChange = prevSessions > 0 ? ((currentSessions - prevSessions) / prevSessions) * 100 : 0;

    const newVisitors = response.rows
      ?.filter(row => row.dimensionValues?.[0]?.value === 'new' && row.dimensionValues?.[1]?.value === 'date_range_0')
      .reduce((acc, row) => acc + Number(row.metricValues?.[0]?.value || 0), 0) || 0;
    
    const returningVisitors = response.rows
      ?.filter(row => row.dimensionValues?.[0]?.value === 'returning' && row.dimensionValues?.[1]?.value === 'date_range_0')
      .reduce((acc, row) => acc + Number(row.metricValues?.[0]?.value || 0), 0) || 0;

    const totalVisitors = newVisitors + returningVisitors;

    const deviceStats = {
      mobile: 0,
      desktop: 0,
      tablet: 0,
    };
    deviceResponse.rows?.forEach(row => {
      const device = row.dimensionValues?.[0]?.value?.toLowerCase();
      const val = Number(row.metricValues?.[0]?.value || 0);
      if (device === 'mobile') deviceStats.mobile = val;
      else if (device === 'desktop') deviceStats.desktop = val;
      else if (device === 'tablet') deviceStats.tablet = val;
    });

    const channelStats = {
      organic: 0,
      direct: 0,
      other: 0,
    };
    channelResponse.rows?.forEach(row => {
      const channel = row.dimensionValues?.[0]?.value?.toLowerCase();
      const val = Number(row.metricValues?.[0]?.value || 0);
      if (channel?.includes('organic')) channelStats.organic += val;
      else if (channel?.includes('direct')) channelStats.direct += val;
      else channelStats.other += val;
    });

    const dailySessions = dailyResponse.rows?.map(row => ({
      date: row.dimensionValues?.[0]?.value || '',
      sessions: Number(row.metricValues?.[0]?.value || 0),
    })) || [];

    return NextResponse.json({
      sessions: currentSessions,
      sessionsChange,
      newVisitors,
      returningVisitors,
      newVisitorsPercent: totalVisitors > 0 ? (newVisitors / totalVisitors) * 100 : 0,
      returningVisitorsPercent: totalVisitors > 0 ? (returningVisitors / totalVisitors) * 100 : 0,
      sessionsByDevice: deviceStats,
      sessionsByChannel: channelStats,
      dailySessions,
    });

  } catch (error: any) {
    console.error('GA4 API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
