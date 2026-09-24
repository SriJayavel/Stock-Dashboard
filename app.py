import streamlit as st
import yfinance as yf
import pandas as pd
import plotly.graph_objects as go
companies = pd.read_csv("companies.csv")

# Set page configuration
st.set_page_config(page_title="Stock Insight Dashboard", layout="wide")
st.title("Stock Insight Dashboard")

#Search functionality
search = st.text_input("Search Company Name")

info = None
ticker = None
matches = pd.DataFrame()

if search and len(search) >= 2:
    matches = companies[
        companies["NAME OF COMPANY"].str.contains(search, case=False, na=False)
        | 
        companies["SYMBOL"].str.contains(search, case=False, na=False)
    ]
    if not matches.empty:
        selected_company = st.selectbox("Select a Company", matches["NAME OF COMPANY"].head(10))
        selected_row = matches[matches["NAME OF COMPANY"] == selected_company].iloc[0]
        ticker = selected_row["SYMBOL"] + ".NS"
    else:
        st.warning("No matching companies found.")
elif search:
     st.warning("Please enter at least 2 characters to search.")

 
 #Display stock price history and key metrics
if ticker:
    with st.spinner(f"loading stock data for {selected_company}..."):
        stock = yf.Ticker(ticker)
        info = stock.info
        st.caption("Company Name:")
        st.title(info.get('longName', 'N/A'))  
        st.caption(
    f"{info.get('sector')} • {info.get('industry')}"
)
# Format market cap for better readability
        market_cap = info.get('marketCap', 0)
        if market_cap >= 1_000_000_000_000:
            value = f"{market_cap / 1_000_000_000_000:.2f} Trillion"
        elif market_cap >= 1_000_000_000:
            value = f"{market_cap / 1_000_000_000:.2f} Billion" 
        elif market_cap >= 1_000_000:
            value = f"{market_cap / 1_000_000:.2f} Million"
        else:
            value = f"{market_cap}" 
#COMPANY MATRICS
        st.subheader("Company Status")
    col1, col2, col3 = st.columns(3)

    with col1:
        with st.container(border=True):
             previous_close = info.get("previousClose")
             current_price = info.get("currentPrice")
             change = current_price - previous_close
             st.metric(
                 "Current Price",
                 f"₹{current_price}",
                 f"{change:.2f}"
            )

        with st.container(border=True):
            st.metric("Market Cap", f"₹{value}")

    with col2:
        with st.container(border=True):
            day_high = info.get("dayHigh")
            st.metric(
                "Day High",
                f"₹{day_high}",
                f"{day_high - previous_close:.2f}"
            )
        with st.container(border=True):
            day_low = info.get("dayLow")
            st.metric(
                "Day Low",
                f"₹{day_low}",
                f"{day_low - previous_close:.2f}"
            )

    with col3:
        with st.container(border=True):
                pe_ratio = info.get("trailingPE")
                st.metric("PE Ratio", pe_ratio)

        with st.container(border=True):
            week_high = info.get("fiftyTwoWeekHigh")
            st.metric(
                "52 Week High",
                f"₹{week_high}",
                f"{week_high - current_price:.2f}"
            )   
    st.divider()        
#STOCK HISTORY
    st.subheader("Stock Price History")
    period = st.selectbox(
     "Select Time Period", 
      ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"])
    
    if period == "1d":
         history = stock.history(period=period, interval="5m")
    elif period in ["5d"]:
         history = stock.history(period=period, interval="30m")
    elif period in ["1mo"]:
         history = stock.history(period=period, interval="1d")
    else:
         history = stock.history(period=period)
#CHART SECTION
    chart_type = st.selectbox(
        "Select Chart Type",
        ["Line Chart", "Candlestick Chart", "Area Chart"])
    if chart_type == "Line Chart":
        fig = go.Figure(data=go.Scatter(x=history.index, y=history['Close'], mode='lines', name='Close Price'))
        
    elif chart_type == "Candlestick Chart":
        fig = go.Figure(data=[go.Candlestick(
            x=history.index,
            open=history['Open'],
            high=history['High'],
            low=history['Low'],
            close=history['Close']
        )])
            
    elif chart_type == "Area Chart":
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=history.index, y=history['Close'], fill='tozeroy', mode='none', name='Close Price'))
    
    fig.update_layout(
       title='Stock Price History',
       xaxis_title='Date',
        yaxis_title='Price (₹)',
        height=750,
        xaxis=dict(
        rangeslider=dict(visible=True),
        type='date')
        )
    st.plotly_chart(fig, use_container_width=True)
# Display company overview
    with st.expander("Company Information"):
      st.write(f"Sector: {info.get('sector')}")
      st.write(f"Industry: {info.get('industry')}")
      st.write(f"Description: {info.get('longBusinessSummary')}")

 
if not ticker:
  st.info("Search for a indian stock by company to begin exploring Stock Insight.")

#STOCK COMPARISON

st.header("Stock Comparison")
st.caption("Select multiple Indian stocks over the past year.")
comparison_options = sorted(companies["NAME OF COMPANY"].dropna().unique().tolist())
selected_companies = st.multiselect("Select Companies to Compare", options=comparison_options, default=comparison_options[:2])

if selected_companies:
    selected_tickers = []
    for company in selected_companies:
        row = companies[companies["NAME OF COMPANY"] == company]
        if not row.empty:
            ticker_symbol = row.iloc[0]["SYMBOL"] + ".NS"
            selected_tickers.append(ticker_symbol)

    if selected_tickers:
        comparison_data = yf.download(selected_tickers, period="1y")['Close']
        st.line_chart(comparison_data)
    else:
        st.warning("No valid tickers found for the selected companies.")

#Investment Return Calculator
investment_return_calculator = st.sidebar.expander("Investment Return Calculator")
with investment_return_calculator:
    st.subheader("Calculate Investment Returns")
    initial_investment = st.number_input("Initial Investment (₹)", min_value=0.0, value=10000.0)
    annual_return_rate = st.number_input("Expected Annual Return Rate (%)", min_value=0.0, value=10.0)
    investment_duration = st.number_input("Investment Duration (Years)", min_value=1, value=5)
    if st.button("Calculate"):
        future_value = initial_investment * ((1 + annual_return_rate / 100) ** investment_duration)
        st.write(f"Future Value of Investment: ₹{future_value:,.2f}")
        effective_annual_return = ((future_value / initial_investment) ** (1 / investment_duration) - 1) * 100
        st.write(f"Effective Annual Return: {effective_annual_return:.2f}%")
    else:
        st.write("Enter the details and click 'Calculate' to see the results.")
#Footer    
st.divider()
st.caption(   
     "Stock Insight Dashboard | Built by Sri Jayavel"
)
            




    

