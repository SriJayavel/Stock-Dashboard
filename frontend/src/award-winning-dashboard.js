/**
 * Award-Winning Dashboard - GPT-Taste Implementation
 * Premium, award-winning interface for Mara Stock Dashboard
 * Implements gpt-taste principles: Artistic Asymmetry, Cabinet Grotesk typography,
 * Inline Typography Images, Horizontal Accordions, Feedback/Testimonial Carousel,
 * Hover Physics, Scroll Pinning, Image Scale & Fade Scroll, Scrubbing Text Reveals, Card Stacking
 */

class AwardWinningDashboard {
  constructor() {
    this.marketData = [];
    this.featuredStocks = [];
    this.isLoading = true;
    this.init();
  }

  async init() {
    await this.fetchMarketData();
    this.createDashboardStructure();
    this.initGSAPAnimations();
    this.loadMarketData();
  }

  async fetchMarketData() {
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock market data
      this.marketData = [
        { symbol: '^NSEI', name: 'NIFTY 50', price: 22421.95, change: -0.88, volume: '2.4L', sector: 'Index' },
        { symbol: '^BSESN', name: 'SENSEX', price: 71909.70, change: -0.79, volume: '1.8L', sector: 'Index' },
        { symbol: '^NSEBANK', name: 'BANK NIFTY', price: 54450.75, change: -0.33, volume: '85K', sector: 'Banking' },
        { symbol: 'RELIANCE.NS', name: 'Reliance Industries', price: 2845.30, change: 1.25, volume: '3.2M', sector: 'Energy' },
        { symbol: 'TCS.NS', name: 'Tata Consultancy Services', price: 4120.75, change: 0.85, volume: '1.8M', sector: 'IT' },
        { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', price: 1625.80, change: -0.42, volume: '2.1M', sector: 'Banking' },
        { symbol: 'INFY.NS', name: 'Infosys', price: 1785.40, change: 2.10, volume: '1.5M', sector: 'IT' },
        { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', price: 1185.90, change: 0.65, volume: '2.8M', sector: 'Banking' },
        { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever', price: 2680.20, change: -0.18, volume: '980K', sector: 'FMCG' },
        { symbol: 'SBIN.NS', name: 'State Bank of India', price: 825.40, change: 0.92, volume: '4.2M', sector: 'Banking' }
      ];

      // Featured stocks for carousel
      this.featuredStocks = this.marketData.filter(stock =>
        ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS'].includes(stock.symbol)
      );

      this.isLoading = false;
    } catch (error) {
      console.error('Error fetching market data:', error);
      this.isLoading = false;
    }
  }

  createDashboardStructure() {
    // Create main dashboard container
    this.container = document.createElement('div');
    this.container.className = 'award-winning-dashboard min-h-screen bg-gradient-to-b from-[#0c0d0e] to-[#090a0b] text-[#e9e6dd] overflow-x-hidden';

    // Inject CSS styles
    this.injectStyles();

    // Create dashboard structure
    this.container.innerHTML = `
      <!-- Premium Navigation Bar - Floating Glass Pill -->
      <nav class="fixed top-0 left-0 right-0 z-50 bg-[rgba(19,21,22,0.8)] backdrop-blur-lg border-b border-[rgba(220,190,126,0.1)] px-8 pt-6 pb-4">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
          <!-- Brand -->
          <div class="flex items-center gap-3">
            <img src="/favicon.svg" alt="Mara Logo" class="w-8 h-8 rounded-lg border-[1px] border-[rgba(220,190,126,0.25)]" />
            <h1 class="text-[Cabinet_Grotesk] font-bold text-[22px] tracking-[-0.045em] bg-gradient-to-r from-[#c8a96a] to-[#a8f0e8] bg-clip-text text-transparent">
              MARA
            </h1>
          </div>

          <!-- Search -->
          <div class="relative w-64">
            <input
              type="text"
              placeholder="Search securities, sectors & macros..."
              class="w-full pl-10 pr-4 py-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] rounded-xl focus:outline-none focus:border-[rgba(200,169,106,0.4)] focus:bg-[rgba(255,255,255,0.04)] text-[Cabinet_Grotesk] text-[14px] transition-all duration-300"
            />
            <svg class="absolute left-3 top-[50%] -translate-y-[50%] w-5 h-5 text-[rgba(160,156,145,0.7)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>

          <!-- Workspace Tabs -->
          <div class="hidden md:flex items-center gap-2">
            ['Markets', 'Discover', 'Analyze', 'Compare', 'Research', 'Monitor'].map((tab, index) => (
              `<button
                key="${tab}"
                class="px-4 py-2 text-[13px] font-medium transition-all duration-300 ${index === 0 ? 'bg-[rgba(200,169,106,0.15)] text-[#c8a96a]' : 'text-[rgba(160,156,145,0.7)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#ffffff]'}"
              >
                ${tab}
              </button>`
            )).join('')
          }

          <!-- User Controls -->
          <div class="flex items-center gap-3">
            <button class="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10 20h4"/>
              </svg>
            </button>
            <button class="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>
              </svg>
            </button>
            <div class="relative">
              <img src="/favicon.svg" alt="Avatar" class="w-8 h-8 rounded-full border-[1px] border-[rgba(220,190,126,0.25)]" />
              <div class="absolute -top-1 -right-1 w-2 h-2 bg-[#10b981] rounded-full border-2 border-[#0c0d0e]"></div>
            </div>
          </div>
        </div>
      </nav>

      <!-- Main Content - AIDA Structure -->
      <main class="pt-20 pb-16" id="dashboard-main-content">
        <!-- Content will be injected here -->
      </main>
    `;

    // Append to body (replacing existing content or adding to it)
    document.body.appendChild(this.container);

    // Create the main content
    this.createMainContent();
  }

  createMainContent() {
    const mainContent = document.getElementById('dashboard-main-content');

    mainContent.innerHTML = `
      <!-- Attention (Hero) - Artistic Asymmetry Layout -->
      <section class="relative min-h-[80vh] flex flex-col-reverse md:flex-row items-start pb-20" id="hero-section">
        <!-- Content will be injected here -->
      </section>

      <!-- Interest (Features/Bento) - Gapless Bento Grid with Selected Components -->
      <section class="mb-20" id="interest-section">
        <!-- Content will be injected here -->
      </section>

      <!-- Desire (GSAP Scroll/Media) - Scroll Pinning + Hover Physics -->
      <section class="mb-20" id="desire-section">
        <!-- Content will be injected here -->
      </section>

      <!-- Action (Footer/Pricing) - Massive CTA + Clean Footer -->
      <section class="border-t border-[rgba(220,190,126,0.1)] pt-16" id="action-section">
        <!-- Content will be injected here -->
      </section>
    `;

    // Inject content for each section
    this.injectHeroSection();
    this.injectInterestSection();
    this.injectDesireSection();
    this.injectActionSection();
  }

  injectHeroSection() {
    const heroSection = document.getElementById('hero-section');
    heroSection.innerHTML = `
      <!-- Text Side - Left Offset -->
      <div class="md:w-1/2 md:pr-12">
        <h1 class="text-[Cabinet_Grotesk] font-bold text-[clamp(3rem,5vw,5.5rem)] mb-6 leading-tight tracking-[-0.02em]">
          Market Intelligence<br/><span class="block text-[#c8a96a]">Where Data Meets Insight</span>
        </h1>
        <p class="text-[rgba(160,156,145,0.8)] text-[Cabinet_Grotesk] mb-8 max-w-[35ch] leading-relaxed">
          Real-time equities intelligence, institutional analytics, and predictive modeling for sophisticated investors seeking alpha in volatile markets.
        </p>
        <div class="flex gap-4">
          <button class="px-6 py-3 bg-[#c8a96a] text-[#17140e] font-medium rounded-lg transition-all duration-300 hover:bg-[#d4b47e] transform hover:scale-[1.02]">
            Get Started
          </button>
          <button class="px-6 py-3 border border-[rgba(220,190,126,0.3)] text-[rgba(220,190,126,0.8)] rounded-lg transition-all duration-300 hover:bg-[rgba(220,190,126,0.1)] hover:text-[#ffffff]">
            Learn More
          </button>
        </div>
      </div>

      <!-- Visual Side - Artistic Element Overlapping -->
      <div class="md:w-1/2 md:pl-12">
        <div class="relative h-[400px] md:h-[500px]">
          <!-- Premium Background Image -->
          <div class="absolute inset-0">
            <img
              src="https://picsum.photos/seed/stock-market/1200/800"
              alt="Market Visualization"
              class="w-full h-full object-cover hero-image"
            />
            <div class="absolute inset-0 bg-gradient-to-tr from-[rgba(12,13,14,0.7)] to-[rgba(9,10,11,0.9)]" />
          </div>

          <!-- Floating Financial Elements -->
          <div class="absolute bottom-0 left-0 w-full p-6">
            <div class="flex space-x-4">
              <div class="flex items-center gap-2 bg-[rgba(20,184,137,0.1)] px-3 py-2 rounded-lg backdrop-blur-sm">
                <span class="text-[#14b8a6] text-[12px] font-medium">NIFTY 50</span>
                <span class="text-[#10b981] text-[14px] font-semibold">22,421.95</span>
                <span class="text-[rgba(16,185,129,0.8)] text-[10px]">▼0.88%</span>
              </div>
              <div class="flex items-center gap-2 bg-[rgba(34,171,148,0.1)] px-3 py-2 rounded-lg backdrop-blur-sm">
                <span class="text-[#4ade80] text-[12px] font-medium">RELIANCE</span>
                <span class="text-[#22c55e] text-[14px] font-semibold">₹2,845.30</span>
                <span class="text-[rgba(34,197,94,0.8)] text-[10px]">▲1.25%</span>
              </div>
              <div class="flex items-center gap-2 bg-[rgba(59,130,246,0.1)] px-3 py-2 rounded-lg backdrop-blur-sm">
                <span class="text-[#3b82f6] text-[12px] font-medium">TCS</span>
                <span class="text-[#60a5fa] text-[14px] font-semibold">₹4,120.75</span>
                <span class="text-[rgba(96,165,250,0.8)] text-[10px]">▲0.85%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  injectInterestSection() {
    const interestSection = document.getElementById('interest-section');
    interestSection.innerHTML = `
      <div class="max-w-7xl mx-auto px-6">
        <h2 class="text-[Cabinet_Grotesk] font-bold text-[28px] mb-12 tracking-[-0.025em]">
          Market Overview
        </h2>

        <!-- Inline Typography Images in Heading -->
        <div class="flex items-center baseline mb-8">
          <span class="text-[Cabinet_Grotesk] text-[20px] font-semibold">Performance</span>
          <span class="inline-block w-24 h-10 rounded-full align-middle bg-cover bg-center mx-2"
            style="background-image: url('https://picsum.photos/seed/performance/80/40')"></span>
          <span class="text-[Cabinet_Grotesk] text-[20px] font-semibold">Metrics</span>
        </div>

        <!-- Gapless Bento Grid -->
        <div class="grid grid-cols-3 gap-4 md:gap-6 grid-flow-dense" id="bento-grid">
          <!-- Content will be injected here -->
        </div>
      </div>
    `;

    // Inject bento grid cards
    this.injectBentoGrid();
  }

  injectBentoGrid() {
    const bentoGrid = document.getElementById('bento-grid');

    bentoGrid.innerHTML = `
      <!-- Card 1: Large Image Card (2x2) -->
      <div class="col-span-2 row-span-2 bg-[rgba(255,255,255,0.02)] rounded-xl p-6 hover:bg-[rgba(255,255,255,0.04)] transition-all duration-500 premium-card" id="top-performers-card">
        <h3 class="text-[Cabinet_Grotesk] font-semibold text-[20px] mb-4">Top Performers</h3>
        <div class="space-y-3" id="top-performers-list">
          <!-- Content will be injected here -->
        </div>
      </div>

      <!-- Card 2: Horizontal Accordion (1x1) -->
      <div class="col-span-1 row-span-1 bg-[rgba(255,255,255,0.02)] rounded-xl p-4 hover:bg-[rgba(255,255,255,0.04)] transition-all duration-500 premium-card" id="sector-rotation-card">
        <h3 class="text-[Cabinet_Grotesk] font-semibold text-[18px] mb-3">Sector Rotation</h3>
        <div class="space-y-2" id="sector-rotation-list">
          <!-- Content will be injected here -->
        </div>
      </div>

      <!-- Card 3: Feedback/Testimonial Carousel (1x2) -->
      <div class="col-span-1 row-span-2 bg-[rgba(255,255,255,0.02)] rounded-xl p-6 hover:bg-[rgba(255,255,255,0.04)] transition-all duration-500 premium-card" id="analyst-insights-card">
        <h3 class="text-[Cabinet_Grotesk] font-semibold text-[18px] mb-4">Analyst Insights</h3>
        <div class="space-y-4" id="analyst-insights-list">
          <!-- Content will be injected here -->
        </div>
        <div class="flex justify-center mt-4">
          <button class="p-2 rounded-full bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)]" id="carousel-nav">
            <svg class="w-4 h-4 text-[#c8a96a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Inject content for each card
    this.injectTopPerformers();
    this.injectSectorRotation();
    this.injectAnalystInsights();
  }

  injectTopPerformers() {
    const topPerformersList = document.getElementById('top-performers-list');
    topPerformersList.innerHTML = this.marketData.slice(0, 4).map((stock, index) => `
      <div class="flex justify-between items-center text-[14px]">
        <span class="flex items-center gap-2">
          <span class="w-[40px]">${stock.symbol.replace('.NS', '')}</span>
          <span class="text-[rgba(160,156,145,0.8)]">${stock.name}</span>
        </span>
        <span class="${stock.change >= 0 ? 'font-mono text-[14px] text-[#10b981]' : 'font-mono text-[14px] text-[#f87171]'}">
          ${stock.change >= 0 ? `+${stock.change}%` : `${stock.change}%`}
        </span>
      </div>
    `).join('');
  }

  injectSectorRotation() {
    const sectorRotationList = document.getElementById('sector-rotation-list');
    sectorRotationList.innerHTML = `
      <div class="flex items-center justify-between p-3 bg-[rgba(200,169,106,0.05)] rounded-lg">
        <span class="text-[13px]">IT</span>
        <span class="font-mono text-[13px] text-[#10b981]">+2.4%</span>
      </div>
      <div class="flex items-center justify-between p-3 bg-[rgba(200,169,106,0.05)] rounded-lg">
        <span class="text-[13px]">Banking</span>
        <span class="font-mono text-[13px] text-[#f87171]">-0.2%</span>
      </div>
      <div class="flex items-center justify-between p-3 bg-[rgba(200,169,106,0.05)] rounded-lg">
        <span class="text-[13px]">Energy</span>
        <span class="font-mono text-[13px] text-[#10b981]">+1.8%</span>
      </div>
    `;
  }

  injectAnalystInsights() {
    const analystInsightsList = document.getElementById('analyst-insights-list');
    analystInsightsList.innerHTML = this.featuredStocks.map((stock, index) => `
      <div class="flex items-start gap-4">
        <div class="relative w-10 h-10 flex-shrink-0">
          <img
            src="https://picsum.photos/seed/analyst-${index}/60/60"
            alt="Analyst"
            class="w-full h-full object-cover rounded-full border-[2px] border-[#c8a96a]"
          />
          <div class="absolute -bottom-1 -right-1 w-2 h-2 bg-[#10b981] rounded-full border-2 border-[#0c0d0e]"></div>
        </div>
        <div class="space-y-1">
          <p class="text-[Cabinet_Grotesk] text-[14px] font-medium">${stock.name}</p>
          <p class="text-[rgba(160,156,145,0.7)] text-[13px] leading-relaxed">
            "Strong fundamentals with ${stock.change > 0 ? 'upward momentum' : 'consolidation phase'} expected in coming quarters."
          </p>
        </div>
      </div>
    `).join('');
  }

  injectDesireSection() {
    const desireSection = document.getElementById('desire-section');
    desireSection.innerHTML = `
      <div class="max-w-7xl mx-auto px-6">
        <h2 class="text-[Cabinet_Grotesk] font-bold text-[28px] mb-10 tracking-[-0.025em]">
          Advanced Analytics
        </h2>
        <p class="text-[rgba(160,156,145,0.7)] text-[Cabinet_Grotesk] mb-8 max-w-[40ch]">
          Sophisticated analytical tools powered by institutional-grade algorithms and real-time data processing.
        </p>

        <!-- Scroll Pinning Layout -->
        <div class="grid grid-cols-[300px_1fr] gap-8" id="analytics-layout">
          <!-- Content will be injected here -->
        </div>
      </div>
    `;

    // Inject analytics layout
    this.injectAnalyticsLayout();
  }

  injectAnalyticsLayout() {
    const analyticsLayout = document.getElementById('analytics-layout');
    analyticsLayout.innerHTML = `
      <!-- Pinned Analytics Panel -->
      <div class="analytics-panel sticky top-[100px]" id="pinned-analytics">
        <!-- Content will be injected here -->
      </div>

      <!-- Scrolling Content -->
      <div class="space-y-6" id="scrolling-content">
        <!-- Content will be injected here -->
      </div>
    `;

    // Inject pinned analytics
    this.injectPinnedAnalytics();

    // Inject scrolling content
    this.injectScrollingContent();
  }

  injectPinnedAnalytics() {
    const pinnedAnalytics = document.getElementById('pinned-analytics');
    pinnedAnalytics.innerHTML = `
      <div class="space-y-6">
        <div class="bg-[rgba(255,255,255,0.02)] rounded-xl p-5">
          <h4 class="text-[Cabinet_Grotesk] font-semibold text-[16px] mb-3">Market Regime</h4>
          <div class="flex items-center justify-between text-[14px]">
            <span>Volatility Index</span>
            <span class="font-mono">18.45 ▼0.8</span>
          </div>
          <div class="flex items-center justify-between mt-2 text-[14px]">
            <span>Put/Call Ratio</span>
            <span class="font-mono">0.87 ▲0.03</span>
          </div>
        </div>

        <div class="bg-[rgba(255,255,255,0.02)] rounded-xl p-5">
          <h4 class="text-[Cabinet_Grotesk] font-semibold text-[16px] mb-3">Flow Analysis</h4>
          <div class="space-y-3">
            <div class="flex items-center justify-between text-[14px]">
              <span>FII Activity</span>
              <span class="font-mono">₹2,400Cr ▲</span>
            </div>
            <div class="flex items-center justify-between text-[14px]">
              <span>DII Activity</span>
              <span class="font-mono">₹1,800Cr ▼</span>
            </div>
            <div class="flex items-center justify-between text-[14px]">
              <span>Retail Participation</span>
              <span class="font-mono">₹950Cr ▲</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  injectScrollingContent() {
    const scrollingContent = document.getElementById('scrolling-content');
    scrollingContent.innerHTML = `
      <!-- Image Scale & Fade Scroll Items -->
      <div class="grid grid-cols-2 gap-6" id="image-scale-fade-content">
        <!-- Content will be injected here -->
      </div>

      <!-- Scrubbing Text Reveals -->
      <div class="bg-[rgba(255,255,255,0.02)] rounded-xl p-6" id="scrubbing-text-content">
        <!-- Content will be injected here -->
      </div>

      <!-- Card Stacking -->
      <div class="space-y-4" id="card-stacking-content">
        <!-- Content will be injected here -->
      </div>
    `;

    // Inject image scale & fade content
    this.injectImageScaleFadeContent();

    // Inject scrubbing text content
    this.injectScrubbingTextContent();

    // Inject card stacking content
    this.injectCardStackingContent();
  }

  injectImageScaleFadeContent() {
    const imageScaleFadeContent = document.getElementById('image-scale-fade-content');
    imageScaleFadeContent.innerHTML = ['Technology', 'Healthcare', 'Financials', 'Energy'].map((sector, index) => `
      <div class="relative group">
        <div class="aspect-w-16 aspect-h-9 bg-[rgba(255,255,255,0.02)] rounded-xl overflow-hidden hero-image">
          <img
            src="https://picsum.photos/seed/${sector.toLowerCase()}/800/450"
            alt="${sector}"
            class="w-full h-full object-cover"
          />
          <div class="absolute inset-0 bg-[rgba(0,0,0,0.4)] opacity-0">
            <div class="absolute inset-0 flex flex-col items-center justify-center text-[Cabinet_Grotesk] text-[20px] font-semibold">
              <span>${sector}</span>
              <span class="block text-[14px] mt-2">${index % 2 === 0 ? '+2.4%' : '-0.8%'}</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  injectScrubbingTextContent() {
    const scrubbingTextContent = document.getElementById('scrubbing-text-content');
    scrubbingTextContent.innerHTML = `
      <h4 class="text-[Cabinet_Grotesk] font-semibold text-[16px] mb-4">Market Outlook</h4>
      <p class="text-[Cabinet_Grotesk] scrub-text text-[18px] leading-relaxed" id="market-outlook-text">
        The current market environment presents selective opportunities in sectors with strong fundamentals and resilient business models, while maintaining caution in overextended valuations.
      </p>
    `;
  }

  injectCardStackingContent() {
    const cardStackingContent = document.getElementById('card-stacking-content');
    cardStackingContent.innerHTML = ['RSI Signals', 'MACD Crossovers', 'Volume Breakouts'].map((signal, index) => `
      <div class="stack-card bg-[rgba(255,255,255,0.02)] rounded-xl p-5">
        <h5 class="text-[Cabinet_Grotesk] font-semibold text-[15px] mb-2">${signal}</h5>
        <p class="text-[rgba(160,156,145,0.7)] text-[14px]">
          Technical indicator showing ${index === 0 ? 'bullish momentum' : index === 1 ? 'convergence pattern' : 'institutional interest'}
        </p>
      </div>
    `).join('');
  }

  injectActionSection() {
    const actionSection = document.getElementById('action-section');
    actionSection.innerHTML = `
      <div class="max-w-7xl mx-auto px-6 pb-16">
        <!-- Massive CTA -->
        <div class="bg-[rgba(200,169,106,0.05)] rounded-2xl p-12 text-center mb-16">
          <h2 class="text-[Cabinet_Grotesk] font-bold text-[32px] mb-6 tracking-[-0.02em] bg-gradient-to-r from-[#c8a96a] to-[#a8f0e8] bg-clip-text text-transparent">
            Elevate Your Investment Strategy
          </h2>
          <p class="text-[rgba(160,156,145,0.8)] text-[Cabinet_Grotesk] mb-8 max-w-[40ch]">
            Access institutional-grade analytics, real-time data, and sophisticated tools previously available only to professional traders and hedge funds.
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-4">
            <button class="px-8 py-4 bg-[#c8a96a] text-[#17140e] font-medium rounded-lg transition-all duration-300 hover:bg-[#d4b47e] transform hover:scale-[1.02] shadow-lg">
              Start Free Trial
            </button>
            <button class="px-8 py-4 border border-[rgba(220,190,126,0.3)] text-[rgba(220,190,126,0.8)] rounded-lg transition-all duration-300 hover:bg-[rgba(220,190,126,0.1)] hover:text-[#ffffff] shadow-lg">
              View Features
            </button>
          </div>
        </div>

        <!-- Clean Footer Links -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-[Cabinet_Grotesk]">
          <div>
            <h4 class="font-semibold text-[18px] mb-4">Platform</h4>
            <ul class="space-y-2">
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Charting Tools</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Technical Indicators</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Fundamental Data</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Alert System</li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-[18px] mb-4">Resources</h4>
            <ul class="space-y-2">
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Market Education</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Research Reports</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Webinars & Events</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">API Documentation</li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-[18px] mb-4">Company</h4>
            <ul class="space-y-2">
              <li class="hover:text-[#c8a96a] transition-colors duration-300">About Mara</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Careers</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Press & Media</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Contact Support</li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-[18px] mb-4">Legal</h4>
            <ul class="space-y-2">
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Terms of Service</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Privacy Policy</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Disclaimer</li>
              <li class="hover:text-[#c8a96a] transition-colors duration-300">Cookie Policy</li>
            </ul>
          </div>
        </div>

        <div class="mt-12 text-center text-[rgba(160,156,145,0.6)] text-[13px] border-t border-[rgba(220,190,126,0.1)] pt-8">
          © 2026 Mara Financial Technologies. All rights reserved. Market data for research purposes only.
        </div>
      </div>
    `;
  }

  initGSAPAnimations() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.loadGSAP());
    } else {
      this.loadGSAP();
    }
  }

  loadGSAP() {
    // Load GSAP and ScrollTrigger if not already loaded
    if (typeof gsap === 'undefined') {
      // Dynamically load GSAP
      const gsapScript = document.createElement('script');
      gsapScript.src = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';
      gsapScript.onload = () => {
        const scrollTriggerScript = document.createElement('script');
        scrollTriggerScript.src = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js';
        scrollTriggerScript.onload = () => this.initAnimations();
        document.head.appendChild(scrollTriggerScript);
      };
      document.head.appendChild(gsapScript);
    } else {
      this.initAnimations();
    }
  }

  initAnimations() {
    // Hover physics for cards
    const cardElements = document.querySelectorAll('.premium-card');
    cardElements.forEach(card => {
      card.addEventListener('mouseenter', () => {
        gsap.to(card, {
          scale: 1.05,
          duration: 0.7,
          ease: 'elastic.out(1, 0.5)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
        });
      });

      card.addEventListener('mouseleave', () => {
        gsap.to(card, {
          scale: 1,
          duration: 0.7,
          ease: 'elastic.out(1, 0.5)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)'
        });
      });
    });

    // Scroll pinning for analytics panel
    ScrollTrigger.create({
      trigger: '.analytics-panel',
      start: 'top top',
      end: 'bottom top',
      pin: true,
      pinSpacing: false
    });

    // Image scale & fade scroll
    const heroImages = document.querySelectorAll('.hero-image');
    heroImages.forEach((img, index) => {
      ScrollTrigger.create({
        trigger: img,
        start: 'top 80%',
        end: 'bottom 20%',
        onEnter: () => gsap.to(img, { scale: 1, opacity: 1, duration: 0.8 }),
        onLeave: () => gsap.to(img, { scale: 0.8, opacity: 0.6, duration: 0.8 }),
        onEnterBack: () => gsap.to(img, { scale: 1, opacity: 1, duration: 0.8 }),
        onLeaveBack: () => gsap.to(img, { scale: 0.8, opacity: 0.6, duration: 0.8 })
      });
    });

    // Scrubbing text reveals
    const textElements = document.querySelectorAll('.scrub-text');
    textElements.forEach(text => {
      const chars = text.textContent.split('');
      text.textContent = '';
      chars.forEach((char, i) => {
        const span = document.createElement('span');
        span.textContent = char;
        span.style.opacity = '0.1';
        span.style.display = 'inline-block';
        text.appendChild(span);
      });

      ScrollTrigger.create({
        trigger: text,
        start: 'top 80%',
        end: 'bottom 20%',
        onEnter: () => {
          gsap.to(text.querySelectorAll('span'), {
            opacity: 1,
            stagger: 0.05,
            duration: 1.5
          });
        }
      });
    });

    // Card stacking animation
    const stackCards = document.querySelectorAll('.stack-card');
    stackCards.forEach((card, index) => {
      ScrollTrigger.create({
        trigger: card,
        start: 'top bottom-=100',
        end: 'top top',
        onEnter: () => gsap.to(card, {
          y: -20 * index,
          duration: 0.8,
          ease: 'power3.out'
        }),
        onLeaveBack: () => gsap.to(card, { y: 0, duration: 0.8 })
      });
    });
  }

  // Method to update dashboard with real data
  updateMarketData(newData) {
    this.marketData = newData;
    // Update UI elements with new data
    // This would be implemented based on how the data is structured
  }

  // Inject CSS styles for the award-winning dashboard
  injectStyles() {
    // This method exists to prevent runtime errors.
    // The actual styling is handled by the existing CSS files (terminal.css, redesign.css)
    // and the bracket notation classes in the HTML are expected to be processed
    // by a CSS utility framework or custom JavaScript that may be loaded elsewhere.
    // If those classes are not working as expected, additional styling support
    // may need to be added here.
  }
}

// Initialize the award-winning dashboard when the script loads
document.addEventListener('DOMContentLoaded', () => {
  window.awardWinningDashboardInstance = new AwardWinningDashboard();
});