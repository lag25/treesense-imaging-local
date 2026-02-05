const analyzeBtn = document.getElementById("analyze");
const report = document.getElementById("report");
const fullscreenModal = document.getElementById("fullscreenModal");
const closeModal = document.getElementById("closeModal");
const modalTitle = document.getElementById("modalTitle");

let tempChart, airChart, uvChart, aqiChart, fullscreenChart;
let chartData = {};

// WHO Air Quality Guidelines (24-hour mean for PM2.5, PM10)
const WHO_THRESHOLDS = {
  pm25: { good: 15, moderate: 25, unhealthy_sensitive: 37.5, unhealthy: 75 },
  pm10: { good: 45, moderate: 75, unhealthy_sensitive: 112.5, unhealthy: 225 }
};

// Calculate AQI based on WHO guidelines
function calculateAQI(pm25, pm10) {
  const pm25Level = getPollutionLevel(pm25, WHO_THRESHOLDS.pm25);
  const pm10Level = getPollutionLevel(pm10, WHO_THRESHOLDS.pm10);
  
  // Use the worse of the two pollutants
  const levels = ['Good', 'Moderate', 'Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy'];
  const maxLevelIndex = Math.max(levels.indexOf(pm25Level), levels.indexOf(pm10Level));
  
  return levels[maxLevelIndex];
}

function getPollutionLevel(value, thresholds) {
  if (value <= thresholds.good) return 'Good';
  if (value <= thresholds.moderate) return 'Moderate';
  if (value <= thresholds.unhealthy_sensitive) return 'Unhealthy for Sensitive Groups';
  if (value <= thresholds.unhealthy) return 'Unhealthy';
  return 'Very Unhealthy';
}

function getAQIColor(level) {
  const colors = {
    'Good': '#00E400',
    'Moderate': '#FFFF00',
    'Unhealthy for Sensitive Groups': '#FF7E00',
    'Unhealthy': '#FF0000',
    'Very Unhealthy': '#8F3F97'
  };
  return colors[level] || '#808080';
}

function getHealthAdvice(level) {
  const advice = {
    'Good': 'Air quality is satisfactory, and air pollution poses little or no risk.',
    'Moderate': 'Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution.',
    'Unhealthy for Sensitive Groups': 'Members of sensitive groups may experience health effects. The general public is less likely to be affected.',
    'Unhealthy': 'Some members of the general public may experience health effects; members of sensitive groups may experience more serious health effects.',
    'Very Unhealthy': 'Health alert: The risk of health effects is increased for everyone.'
  };
  return advice[level] || 'Data unavailable';
}

// Calculate average pollution for current period
function calculateAveragePollution(pm25Array, pm10Array) {
  const validPM25 = pm25Array.filter(v => v != null);
  const validPM10 = pm10Array.filter(v => v != null);
  
  const avgPM25 = validPM25.reduce((a, b) => a + b, 0) / validPM25.length;
  const avgPM10 = validPM10.reduce((a, b) => a + b, 0) / validPM10.length;
  
  return { avgPM25: avgPM25.toFixed(2), avgPM10: avgPM10.toFixed(2) };
}

// Chart click handlers
document.querySelectorAll('.chart-card').forEach(card => {
  card.addEventListener('click', function() {
    const chartType = this.dataset.chart;
    openFullscreen(chartType);
  });
});

// Close modal handlers
closeModal.addEventListener('click', closeFullscreenModal);
fullscreenModal.addEventListener('click', function(e) {
  if (e.target === fullscreenModal) {
    closeFullscreenModal();
  }
});

// ESC key to close modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fullscreenModal.classList.contains('active')) {
    closeFullscreenModal();
  }
});

function openFullscreen(chartType) {
  if (!chartData[chartType]) return;

  const titles = {
    temp: 'Temperature Trends',
    air: 'Air Quality (PM2.5 & PM10)',
    uv: 'UV Index',
    aqi: 'Air Quality Index Over Time'
  };

  modalTitle.textContent = titles[chartType];
  
  if (fullscreenChart) {
    fullscreenChart.destroy();
  }

  fullscreenChart = new Chart(document.getElementById('fullscreenChart'), chartData[chartType]);
  fullscreenModal.classList.add('active');
}

function closeFullscreenModal() {
  fullscreenModal.classList.remove('active');
  if (fullscreenChart) {
    fullscreenChart.destroy();
    fullscreenChart = null;
  }
}

analyzeBtn.addEventListener("click", async () => {
  const city = document.getElementById("city").value;
  if (!city) {
    alert("Enter a city");
    return;
  }

  try {
    // =====================
    // 1. GEOCODING
    // =====================
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    );
    const geo = await geoRes.json();

    if (!geo.results || geo.results.length === 0) {
      alert("City not found");
      return;
    }

    const { latitude, longitude, name, country } = geo.results[0];

    // =====================
    // 2. WEATHER DATA (Current + Historical)
    // =====================
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    
    // Get past year for historical baseline
    const startDate = new Date(today);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Current forecast with additional ecological parameters
    const weatherURL =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${latitude}` +
      `&longitude=${longitude}` +
      "&daily=temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_sum,wind_speed_10m_max" +
      "&hourly=precipitation_probability,cloud_cover" +
      "&timezone=auto";

    const weatherRes = await fetch(weatherURL);
    const weatherData = await weatherRes.json();

    // Historical data for baseline
    const historicalURL =
      "https://archive-api.open-meteo.com/v1/archive" +
      `?latitude=${latitude}` +
      `&longitude=${longitude}` +
      `&start_date=${startDateStr}` +
      `&end_date=${endDate}` +
      "&daily=temperature_2m_max,temperature_2m_min" +
      "&timezone=auto";

    const historicalRes = await fetch(historicalURL);
    const historicalData = await historicalRes.json();

    if (!weatherData.daily) {
      alert("Weather data unavailable");
      return;
    }

    // Calculate historical averages for anomaly detection
    let avgMaxTemp = 0, avgMinTemp = 0;
    if (historicalData.daily) {
      const maxTemps = historicalData.daily.temperature_2m_max.filter(t => t != null);
      const minTemps = historicalData.daily.temperature_2m_min.filter(t => t != null);
      avgMaxTemp = (maxTemps.reduce((a, b) => a + b, 0) / maxTemps.length).toFixed(1);
      avgMinTemp = (minTemps.reduce((a, b) => a + b, 0) / minTemps.length).toFixed(1);
    }

    // =====================
    // 3. AIR QUALITY DATA
    // =====================
    const airQualityURL =
      "https://air-quality-api.open-meteo.com/v1/air-quality" +
      `?latitude=${latitude}` +
      `&longitude=${longitude}` +
      "&hourly=pm2_5,pm10" +
      "&timezone=auto";

    const airRes = await fetch(airQualityURL);
    const airData = await airRes.json();

    if (!airData.hourly) {
      alert("Air quality data unavailable");
      return;
    }

    // =====================
    // 4. SHOW REPORT
    // =====================
    report.style.display = "block";

    // Calculate current air quality metrics
    const currentPM25 = airData.hourly.pm2_5.slice(0, 24);
    const currentPM10 = airData.hourly.pm10.slice(0, 24);
    const { avgPM25, avgPM10 } = calculateAveragePollution(currentPM25, currentPM10);
    const aqiLevel = calculateAQI(parseFloat(avgPM25), parseFloat(avgPM10));
    const aqiColor = getAQIColor(aqiLevel);
    const healthAdvice = getHealthAdvice(aqiLevel);

    // Calculate temperature anomaly
    const currentMaxTemp = weatherData.daily.temperature_2m_max[0];
    const tempAnomaly = (currentMaxTemp - avgMaxTemp).toFixed(1);
    const anomalyText = tempAnomaly > 0 ? `+${tempAnomaly}°C above` : `${tempAnomaly}°C below`;

    // Calculate exposure risk score
    const currentUV = weatherData.daily.uv_index_max[0] || 0;
    const currentWind = weatherData.daily.wind_speed_10m_max[0] || 0;
    const currentPrecip = weatherData.daily.precipitation_sum[0] || 0;
    
    let exposureRisk = 'Low';
    let exposureColor = '#00E400';
    if (currentUV > 8 || currentWind > 40) {
      exposureRisk = 'High';
      exposureColor = '#FF0000';
    } else if (currentUV > 5 || currentWind > 25 || currentPrecip > 10) {
      exposureRisk = 'Moderate';
      exposureColor = '#FFFF00';
    }

    // LOCATION META WITH ENHANCED INFO
    document.getElementById("locationMeta").innerHTML = `
      <p><strong>City:</strong> ${name}, ${country}</p>
      <p><strong>Coordinates:</strong> ${latitude}°N, ${longitude}°E</p>
      <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;">
      <p><strong>Current Air Quality Index:</strong> <span style="color: ${aqiColor}; font-weight: bold;">${aqiLevel}</span></p>
      <p><strong>PM2.5:</strong> ${avgPM25} µg/m³ (WHO guideline: ≤15 µg/m³)</p>
      <p><strong>PM10:</strong> ${avgPM10} µg/m³ (WHO guideline: ≤45 µg/m³)</p>
      <p style="background: #f0f0f0; padding: 10px; border-radius: 5px; margin-top: 10px;">
        <strong>Health Advisory:</strong> ${healthAdvice}
      </p>
      <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;">
      <p><strong>Outdoor Exposure Risk:</strong> <span style="color: ${exposureColor}; font-weight: bold;">${exposureRisk}</span></p>
      <p><strong>Current UV Index:</strong> ${currentUV} | <strong>Wind:</strong> ${currentWind.toFixed(1)} km/h | <strong>Precipitation:</strong> ${currentPrecip.toFixed(1)} mm</p>
      <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;">
      <p><strong>Temperature Anomaly:</strong> ${anomalyText} historical average (${avgMaxTemp}°C)</p>
      <p style="font-size: 12px; color: #666;">Baseline: Past year average (${startDateStr} to ${endDate})</p>
    `;

    // =====================
    // 5. TEMPERATURE CHART WITH BASELINE
    // =====================
    if (tempChart) tempChart.destroy();
    
    const tempConfig = {
      type: "line",
      data: {
        labels: weatherData.daily.time,
        datasets: [
          {
            label: "Max Temperature (°C)",
            data: weatherData.daily.temperature_2m_max,
            borderColor: '#FF6384',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            borderWidth: 2,
            fill: true
          },
          {
            label: "Min Temperature (°C)",
            data: weatherData.daily.temperature_2m_min,
            borderColor: '#36A2EB',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            borderWidth: 2,
            fill: true
          },
          {
            label: "Historical Avg Max",
            data: Array(weatherData.daily.time.length).fill(avgMaxTemp),
            borderColor: '#FF6384',
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          },
          {
            label: "Historical Avg Min",
            data: Array(weatherData.daily.time.length).fill(avgMinTemp),
            borderColor: '#36A2EB',
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true }
        }
      }
    };
    
    tempChart = new Chart(document.getElementById("tempChart"), tempConfig);
    chartData.temp = tempConfig;

    // =====================
    // 6. AIR QUALITY CHART WITH WHO THRESHOLDS
    // =====================
    if (airChart) airChart.destroy();
    
    const airConfig = {
      type: "bar",
      data: {
        labels: airData.hourly.time.slice(0, 24).map(t => {
          const hour = new Date(t).getHours();
          return `${hour}:00`;
        }),
        datasets: [
          {
            label: "PM2.5 (µg/m³)",
            data: currentPM25,
            backgroundColor: currentPM25.map(v => {
              if (v <= WHO_THRESHOLDS.pm25.good) return 'rgba(0, 228, 0, 0.6)';
              if (v <= WHO_THRESHOLDS.pm25.moderate) return 'rgba(255, 255, 0, 0.6)';
              if (v <= WHO_THRESHOLDS.pm25.unhealthy_sensitive) return 'rgba(255, 126, 0, 0.6)';
              if (v <= WHO_THRESHOLDS.pm25.unhealthy) return 'rgba(255, 0, 0, 0.6)';
              return 'rgba(143, 63, 151, 0.6)';
            }),
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          },
          {
            label: "PM10 (µg/m³)",
            data: currentPM10,
            backgroundColor: currentPM10.map(v => {
              if (v <= WHO_THRESHOLDS.pm10.good) return 'rgba(0, 228, 0, 0.4)';
              if (v <= WHO_THRESHOLDS.pm10.moderate) return 'rgba(255, 255, 0, 0.4)';
              if (v <= WHO_THRESHOLDS.pm10.unhealthy_sensitive) return 'rgba(255, 126, 0, 0.4)';
              if (v <= WHO_THRESHOLDS.pm10.unhealthy) return 'rgba(255, 0, 0, 0.4)';
              return 'rgba(143, 63, 151, 0.4)';
            }),
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: "Air Pollution Concentration (Next 24 Hours) - Color coded by WHO guidelines"
          },
          legend: { display: true }
        }
      }
    };
    
    airChart = new Chart(document.getElementById("airChart"), airConfig);
    chartData.air = airConfig;

    // =====================
    // 7. ECOLOGICAL EXPOSURE CHART (UV, Precipitation, Wind)
    // =====================
    if (uvChart) uvChart.destroy();
    
    // Calculate average daily cloud cover and precipitation probability
    const dailyCloudCover = [];
    const dailyPrecipProb = [];
    
    for (let i = 0; i < weatherData.daily.time.length; i++) {
      const startHour = i * 24;
      const endHour = Math.min(startHour + 24, weatherData.hourly.cloud_cover.length);
      
      const dayCloudCover = weatherData.hourly.cloud_cover.slice(startHour, endHour);
      const dayPrecipProb = weatherData.hourly.precipitation_probability.slice(startHour, endHour);
      
      const avgCloud = dayCloudCover.reduce((a, b) => (a || 0) + (b || 0), 0) / dayCloudCover.length;
      const avgPrecip = dayPrecipProb.reduce((a, b) => (a || 0) + (b || 0), 0) / dayPrecipProb.length;
      
      dailyCloudCover.push(avgCloud.toFixed(0));
      dailyPrecipProb.push(avgPrecip.toFixed(0));
    }
    
    const uvConfig = {
      type: "line",
      data: {
        labels: weatherData.daily.time,
        datasets: [
          {
            label: "UV Index",
            data: weatherData.daily.uv_index_max,
            borderColor: '#FF6B6B',
            backgroundColor: 'rgba(255, 107, 107, 0.2)',
            borderWidth: 2,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: "Precipitation (mm)",
            data: weatherData.daily.precipitation_sum,
            borderColor: '#4ECDC4',
            backgroundColor: 'rgba(78, 205, 196, 0.2)',
            borderWidth: 2,
            fill: true,
            yAxisID: 'y1'
          },
          {
            label: "Wind Speed (km/h)",
            data: weatherData.daily.wind_speed_10m_max,
            borderColor: '#95E1D3',
            backgroundColor: 'rgba(149, 225, 211, 0.2)',
            borderWidth: 2,
            fill: false,
            yAxisID: 'y1'
          },
          {
            label: "Cloud Cover (%)",
            data: dailyCloudCover,
            borderColor: '#B0B0B0',
            backgroundColor: 'rgba(176, 176, 176, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { display: true },
          title: {
            display: true,
            text: 'Combined Environmental Exposure Factors'
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'UV Index'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Precipitation (mm) / Wind (km/h)'
            },
            grid: {
              drawOnChartArea: false
            }
          },
          y2: {
            type: 'linear',
            display: false,
            position: 'right',
            min: 0,
            max: 100
          }
        }
      }
    };
    
    uvChart = new Chart(document.getElementById("uvChart"), uvConfig);
    chartData.uv = uvConfig;

    // =====================
    // 8. AQI TREND CHART
    // =====================
    if (aqiChart) aqiChart.destroy();
    
    // Calculate AQI for each hour
    const aqiValues = currentPM25.map((pm25, i) => {
      const pm10 = currentPM10[i];
      const level = calculateAQI(pm25 || 0, pm10 || 0);
      const levelMap = {
        'Good': 1,
        'Moderate': 2,
        'Unhealthy for Sensitive Groups': 3,
        'Unhealthy': 4,
        'Very Unhealthy': 5
      };
      return levelMap[level];
    });

    const aqiConfig = {
      type: "line",
      data: {
        labels: airData.hourly.time.slice(0, 24).map(t => {
          const hour = new Date(t).getHours();
          return `${hour}:00`;
        }),
        datasets: [
          {
            label: "AQI Level",
            data: aqiValues,
            borderColor: '#4BC0C0',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderWidth: 2,
            fill: true,
            stepped: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 6,
            ticks: {
              stepSize: 1,
              callback: function(value) {
                const labels = ['', 'Good', 'Moderate', 'Unhealthy (Sensitive)', 'Unhealthy', 'Very Unhealthy'];
                return labels[value] || '';
              }
            }
          }
        },
        plugins: {
          legend: { display: true }
        }
      }
    };
    
    aqiChart = new Chart(document.getElementById("aqiChart"), aqiConfig);
    chartData.aqi = aqiConfig;

  } catch (error) {
    console.error(error);
    alert("An unexpected error occurred. Please try again.");
  }
});