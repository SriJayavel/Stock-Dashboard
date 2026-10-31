import React, { useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

const AwardWinningDashboard = () => {
  const [marketData, setMarketData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [featuredStocks, setFeaturedStocks] = useState([]);

  // Simulate data fetching - in real app, this would come from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock market data
        const mockMarketData = [
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

        setMarketData(mockMarketData);

        // Featured stocks for carousel
        const featured = mockMarketData.filter(stock =>
          ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS'].includes(stock.symbol)
        );
        setFeaturedStocks(featured);

        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching market data:', error);
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // GSAP animations
  useEffect(() => {
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
  }, []);

  return (
    <div className="award-winning-dashboard min-h-screen bg-gradient-to-b from-[#0c0d0e] to-[#090a0b] text-[#e9e6dd] overflow-x-hidden">
      {/* Premium Navigation Bar - Floating Glass Pill */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[rgba(19,21,22,0.8)] backdrop-blur-lg border-b border-[rgba(220,190,126,0.1)] px-8 pt-6 pb-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Mara Logo" className="w-8 h-8 rounded-lg border-[1px] border-[rgba(220,190,126,0.25)]" />
            <h1 className="text-[Cabinet_Grotesk] font-bold text-[22px] tracking-[-0.045em] bg-gradient-to-r from-[#c8a96a] to-[#a8f0e8] bg-clip-text text-transparent">
              MARA
            </h1>
          </div>

          {/* Search */}
          <div className="relative w-64">
            <input
              type="text"
              placeholder="Search securities, sectors & macros..."
              className="w-full pl-10 pr-4 py-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] rounded-xl focus:outline-none focus:border-[rgba(200,169,106,0.4)] focus:bg-[rgba(255,255,255,0.04)] text-[Cabinet_Grotesk] text-[14px] transition-all duration-300"
            />
            <svg className="absolute left-3 top-[50%] -translate-y-[50%] w-5 h-5 text-[rgba(160,156,145,0.7)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>

          {/* Workspace Tabs */}
          <div className="hidden md:flex items-center gap-2">
            ['Markets', 'Discover', 'Analyze', 'Compare', 'Research', 'Monitor'].map((tab, index) => (
              <button
                key={tab}
                className={`px-4 py-2 text-[13px] font-medium transition-all duration-300 ${index === 0 ? 'bg-[rgba(200,169,106,0.15)] text-[#c8a96a]' : 'text-[rgba(160,156,145,0.7)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#ffffff]'}`}
              >
                {tab}
              </button>
            ))
          </div>

          {/* User Controls */}
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10 20h4"/>
              </svg>
            </button>
            <button className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>
              </svg>
            </button>
            <div className="relative">
              <img src="/favicon.svg" alt="Avatar" className="w-8 h-8 rounded-full border-[1px] border-[rgba(220,190,126,0.25)]" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#10b981] rounded-full border-2 border-[#0c0d0e]"></div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content - AIDA Structure */}
      <main className="pt-20 pb-16">
        {/* Attention (Hero) - Artistic Asymmetry Layout */}
        <section className="relative min-h-[80vh] flex flex-col-reverse md:flex-row items-start pb-20">
          {/* Text Side - Left Offset */}
          <div className="md:w-1/2 md:pr-12">
            <h1 className="text-[Cabinet_Grotesk] font-bold text-[clamp(3rem,5vw,5.5rem)] mb-6 leading-tight tracking-[-0.02em]">
              Market Intelligence<br/><span className="block text-[#c8a96a]">Where Data Meets Insight</span>
            </h1>
            <p className="text-[rgba(160,156,145,0.8)] text-[Cabinet_Grotesk] mb-8 max-w-[35ch] leading-relaxed">
              Real-time equities intelligence, institutional analytics, and predictive modeling for sophisticated investors seeking alpha in volatile markets.
            </p>
            <div className="flex gap-4">
              <button className="px-6 py-3 bg-[#c8a96a] text-[#17140e] font-medium rounded-lg transition-all duration-300 hover:bg-[#d4b47e] transform hover:scale-[1.02]">
                Get Started
              </button>
              <button className="px-6 py-3 border border-[rgba(220,190,126,0.3)] text-[rgba(220,190,126,0.8)] rounded-lg transition-all duration-300 hover:bg-[rgba(220,190,126,0.1)] hover:text-[#ffffff]">
                Learn More
              </button>
            </div>
          </div>

          {/* Visual Side - Artistic Element Overlapping */}
          <div className="md:w-1/2 md:pl-12">
            <div className="relative h-[400px] md:h-[500px]">
              {/* Premium Background Image */}
              <div className="absolute inset-0">
                <img
                  src="https://picsum.photos/seed/stock-market/1200/800"
                  alt="Market Visualization"
                  className="w-full h-full object-cover hero-image"
                  style={{ opacity: 0.7 }}
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-[rgba(12,13,14,0.7)] to-[rgba(9,10,11,0.9)]" />
              </div>

              {/* Floating Financial Elements */}
              <div className="absolute bottom-0 left-0 w-full p-6">
                <div className="flex space-x-4">
                  <div className="flex items-center gap-2 bg-[rgba(20,184,137,0.1)] px-3 py-2 rounded-lg backdrop-blur-sm">
                    <span className="text-[#14b8a6] text-[12px] font-medium">NIFTY 50</span>
                    <span className="text-[#10b981] text-[14px] font-semibold">22,421.95</span>
                    <span className="text-[rgba(16,185,129,0.8)] text-[10px]">▼0.88%</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[rgba(34,171,148,0.1)] px-3 py-2 rounded-lg backdrop-blur-sm">
                    <span className="text-[#4ade80] text-[12px] font-medium">RELIANCE</span>
                    <span className="text-[#22c55e] text-[14px] font-semibold">₹2,845.30</span>
                    <span className="text-[rgba(34,197,94,0.8)] text-[10px]">▲1.25%</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[rgba(59,130,246,0.1)] px-3 py-2 rounded-lg backdrop-blur-sm">
                    <span className="text-[#3b82f6] text-[12px] font-medium">TCS</span>
                    <span className="text-[#60a5fa] text-[14px] font-semibold">₹4,120.75</span>
                    <span className="text-[rgba(96,165,250,0.8)] text-[10px]">▲0.85%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interest (Features/Bento) - Gapless Bento Grid with Selected Components */}
        <section className="mb-20">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-[Cabinet_Grotesk] font-bold text-[28px] mb-12 tracking-[-0.025em]">
              Market Overview
            </h2>

            {/* Inline Typography Images in Heading */}
            <div className="flex items-center baseline mb-8">
              <span className="text-[Cabinet_Grotesk] text-[20px] font-semibold">Performance</span>
              <span className="inline-block w-24 h-10 rounded-full align-middle bg-cover bg-center mx-2"
                style={{ backgroundImage: 'url("https://picsum.photos/seed/performance/80/40")' }}></span>
              <span className="text-[Cabinet_Grotesk] text-[20px] font-semibold">Metrics</span>
            </div>

            {/* Gapless Bento Grid */}
            <div className="grid grid-cols-3 gap-4 md:gap-6 grid-flow-dense">
              {/* Card 1: Large Image Card (2x2) */}
              <div className="col-span-2 row-span-2 bg-[rgba(255,255,255,0.02)] rounded-xl p-6 hover:bg-[rgba(255,255,255,0.04)] transition-all duration-500 premium-card">
                <h3 className="text-[Cabinet_Grotesk] font-semibold text-[20px] mb-4">Top Performers</h3>
                <div className="space-y-3">
                  {marketData.slice(0, 4).map((stock, index) => (
                    <div key={index} className="flex justify-between items-center text-[14px]">
                      <span className="flex items-center gap-2">
                        <span className="w-[40px]">{stock.symbol.replace('.NS', '')}</span>
                        <span className="text-[rgba(160,156,145,0.8)]">{stock.name}</span>
                      </span>
                      <span className={`font-mono text-[14px] ${stock.change >= 0 ? 'text-[#10b981]' : 'text-[#f87171]'}`}>
                        {stock.change >= 0 ? `+${stock.change}%` : `${stock.change}%`}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Card 2: Horizontal Accordion (1x1) */}
              <div className="col-span-1 row-span-1 bg-[rgba(255,255,255,0.02)] rounded-xl p-4 hover:bg-[rgba(255,255,255,0.04)] transition-all duration-500 premium-card">
                <h3 className="text-[Cabinet_Grotesk] font-semibold text-[18px] mb-3">Sector Rotation</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-[rgba(200,169,106,0.05)] rounded-lg">
                    <span className="text-[13px]">IT</span>
                    <span className="font-mono text-[13px] text-[#10b981]">+2.4%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[rgba(200,169,106,0.05)] rounded-lg">
                    <span className="text-[13px]">Banking</span>
                    <span className="font-mono text-[13px] text-[#f87171]">-0.2%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[rgba(200,169,106,0.05)] rounded-lg">
                    <span className="text-[13px]">Energy</span>
                    <span className="font-mono text-[13px] text-[#10b981]">+1.8%</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Feedback/Testimonial Carousel (1x2) */}
              <div className="col-span-1 row-span-2 bg-[rgba(255,255,255,0.02)] rounded-xl p-6 hover:bg-[rgba(255,255,255,0.04)] transition-all duration-500 premium-card">
                <h3 className="text-[Cabinet_Grotesk] font-semibold text-[18px] mb-4">Analyst Insights</h3>
                <div className="space-y-4">
                  {featuredStocks.map((stock, index) => (
                    <div key={index} className="flex items-start gap-4">
                      <div className="relative w-10 h-10 flex-shrink-0">
                        <img
                          src="https://picsum.photos/seed/analyst-${index}/60/60"
                          alt="Analyst"
                          className="w-full h-full object-cover rounded-full border-[2px] border-[#c8a96a]"
                        />
                        <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#10b981] rounded-full border-2 border-[#0c0d0e]"></div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[Cabinet_Grotesk] text-[14px] font-medium">{stock.name}</p>
                        <p className="text-[rgba(160,156,145,0.7)] text-[13px] leading-relaxed">
                          "Strong fundamentals with {stock.change > 0 ? 'upward momentum' : 'consolidation phase'} expected in coming quarters."
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-center mt-4">
                    <button className="p-2 rounded-full bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)]">
                      <svg className="w-4 h-4 text-[#c8a96a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 4v16m8-8H4"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Desire (GSAP Scroll/Media) - Scroll Pinning + Hover Physics */}
        <section className="mb-20">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-[Cabinet_Grotesk] font-bold text-[28px] mb-10 tracking-[-0.025em]">
              Advanced Analytics
            </h2>
            <p className="text-[rgba(160,156,145,0.7)] text-[Cabinet_Grotesk] mb-8 max-w-[40ch]">
              Sophisticated analytical tools powered by institutional-grade algorithms and real-time data processing.
            </p>

            {/* Scroll Pinning Layout */}
            <div className="grid grid-cols-[300px_1fr] gap-8">
              {/* Pinned Analytics Panel */}
              <div className="analytics-panel sticky top-[100px]">
                <div className="space-y-6">
                  <div className="bg-[rgba(255,255,255,0.02)] rounded-xl p-5">
                    <h4 className="text-[Cabinet_Grotesk] font-semibold text-[16px] mb-3">Market Regime</h4>
                    <div className="flex items-center justify-between text-[14px]">
                      <span>Volatility Index</span>
                      <span className="font-mono">18.45 ▼0.8</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[14px]">
                      <span>Put/Call Ratio</span>
                      <span className="font-mono">0.87 ▲0.03</span>
                    </div>
                  </div>

                  <div className="bg-[rgba(255,255,255,0.02)] rounded-xl p-5">
                    <h4 className="text-[Cabinet_Grotesk] font-semibold text-[16px] mb-3">Flow Analysis</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[14px]">
                        <span>FII Activity</span>
                        <span className="font-mono">₹2,400Cr ▲</span>
                      </div>
                      <div className="flex items-center justify-between text-[14px]">
                        <span>DII Activity</span>
                        <span className="font-mono">₹1,800Cr ▼</span>
                      </div>
                      <div className="flex items-center justify-between text-[14px]">
                        <span>Retail Participation</span>
                        <span className="font-mono">₹950Cr ▲</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrolling Content */}
              <div className="space-y-6">
                {/* Image Scale & Fade Scroll Items */}
                <div className="grid grid-cols-2 gap-6">
                  {['Technology', 'Healthcare', 'Financials', 'Energy'].map((sector, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-w-16 aspect-h-9 bg-[rgba(255,255,255,0.02)] rounded-xl overflow-hidden hero-image">
                        <img
                          src={`https://picsum.photos/seed/${sector.toLowerCase()}/800/450`}
                          alt={sector}
                          className="w-full h-full object-cover transition-transform duration-1000"
                        />
                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.4)] opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-[Cabinet_Grotesk] text-[20px] font-semibold">
                            <span>{sector}</span>
                            <span className="block text-[14px] mt-2">{index % 2 === 0 ? '+2.4%' : '-0.8%'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Scrubbing Text Reveals */}
                <div className="bg-[rgba(255,255,255,0.02)] rounded-xl p-6">
                  <h4 className="text-[Cabinet_Grotesk] font-semibold text-[16px] mb-4">Market Outlook</h4>
                  <p className="text-[Cabinet_Grotesk] scrub-text text-[18px] leading-relaxed">
                    The current market environment presents selective opportunities in sectors with strong fundamentals and resilient business models, while maintaining caution in overextended valuations.
                  </p>
                </div>

                {/* Card Stacking */}
                <div className="space-y-4">
                  {['RSI Signals', 'MACD Crossovers', 'Volume Breakouts'].map((signal, index) => (
                    <div key={index} className="stack-card bg-[rgba(255,255,255,0.02)] rounded-xl p-5">
                      <h5 className="text-[Cabinet_Grotesk] font-semibold text-[15px] mb-2">{signal}</h5>
                      <p className="text-[rgba(160,156,145,0.7)] text-[14px]">
                        Technical indicator showing {index === 0 ? 'bullish momentum' : index === 1 ? 'convergence pattern' : 'institutional interest'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Action (Footer/Pricing) - Massive CTA + Clean Footer */}
        <section className="border-t border-[rgba(220,190,126,0.1)] pt-16">
          <div className="max-w-7xl mx-auto px-6 pb-16">
            {/* Massive CTA */}
            <div className="bg-[rgba(200,169,106,0.05)] rounded-2xl p-12 text-center mb-16">
              <h2 className="text-[Cabinet_Grotesk] font-bold text-[32px] mb-6 tracking-[-0.02em] bg-gradient-to-r from-[#c8a96a] to-[#a8f0e8] bg-clip-text text-transparent">
                Elevate Your Investment Strategy
              </h2>
              <p className="text-[rgba(160,156,145,0.8)] text-[Cabinet_Grotesk] mb-8 max-w-[40ch]">
                Access institutional-grade analytics, real-time data, and sophisticated tools previously available only to professional traders and hedge funds.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button className="px-8 py-4 bg-[#c8a96a] text-[#17140e] font-medium rounded-lg transition-all duration-300 hover:bg-[#d4b47e] transform hover:scale-[1.02] shadow-lg">
                  Start Free Trial
                </button>
                <button className="px-8 py-4 border border-[rgba(220,190,126,0.3)] text-[rgba(220,190,126,0.8)] rounded-lg transition-all duration-300 hover:bg-[rgba(220,190,126,0.1)] hover:text-[#ffffff] shadow-lg">
                  View Features
                </button>
              </div>
            </div>

            {/* Clean Footer Links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-[Cabinet_Grotesk]">
              <div>
                <h4 className="font-semibold text-[18px] mb-4">Platform</h4>
                <ul className="space-y-2">
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Charting Tools</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Technical Indicators</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Fundamental Data</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Alert System</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-[18px] mb-4">Resources</h4>
                <ul className="space-y-2">
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Market Education</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Research Reports</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Webinars & Events</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">API Documentation</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-[18px] mb-4">Company</h4>
                <ul className="space-y-2">
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">About Mara</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Careers</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Press & Media</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Contact Support</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-[18px] mb-4">Legal</h4>
                <ul className="space-y-2">
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Terms of Service</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Privacy Policy</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Disclaimer</li>
                  <li className="hover:text-[#c8a96a] transition-colors duration-300">Cookie Policy</li>
                </ul>
              </div>
            </div>

            <div className="mt-12 text-center text-[rgba(160,156,145,0.6)] text-[13px] border-t border-[rgba(220,190,126,0.1)] pt-8">
              © 2026 Mara Financial Technologies. All rights reserved. Market data for research purposes only.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AwardWinningDashboard;
