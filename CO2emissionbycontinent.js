importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.4/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/panel-0.14.4-py3-none-any.whl', 'pyodide-http==0.1.0', 'holoviews>=1.15.4', 'hvplot', 'numpy', 'pandas']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

#!/usr/bin/env python
# coding: utf-8

# In[1]:


#pip install hvplot


# In[2]:


#pip install jupyterlab


# In[3]:


#pip install panel


# In[4]:


#pip install --upgrade Pillow "DLL load failed while importing _imaging:"


# In[5]:


import pandas as pd
import numpy as np 
import panel as pn 
pn.extension('tabulator')

import hvplot.pandas


# In[6]:


df=pd.read_csv('https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv')


# In[7]:


df


# In[8]:


df.columns


# In[9]:


df[df['country']=='World']


# ### A little data prepocessing

# Filling NAs with 0s and creating a GDP per capita column

# In[10]:


df = df.fillna(0)
df['gdp_per_capita']=np.where(df['population']!=0, df['gdp']/df['population'],0)


# Making an Interactive DataFrame Pipeline

# In[11]:


idf=df.interactive()


# ### Co2 emission over time by continent

# Defining Panel widgets

# In[12]:


year_slider=pn.widgets.IntSlider(name='Year slider', start=1750, end=2020,step=5,value=1850)
year_slider


# Different type if [widgets](https://panel.holoviz.org/user_guide/Widgets.html)

# Radio buttons for CO2 measures

# In[13]:


yaxis_co2 = pn.widgets.RadioButtonGroup(
    name='Y axis',
    options=['co2','co2_per_capita',],
    button_type='success'
)    


# In[14]:


continents=['World','Asia','Oceania','Europe','Africa','North America','South America','Antarctica']

co2_pipeline = (
    idf[
        (idf.year <= year_slider) &
        (idf.country.isin(continents))
    ]
    .groupby(['country','year'])[yaxis_co2].mean()
    .to_frame()
    .reset_index()
    .sort_values(by='year')
    .reset_index(drop=True)
)


# In[15]:


co2_pipeline


# In[16]:


co2_plot = co2_pipeline.hvplot(x='year',by='country',y=yaxis_co2,line_width=2,title='CO2 emission by continent')
co2_plot


# ### Table - CO2 emission over time by continent

# In[17]:


co2_table = co2_pipeline.pipe(pn.widgets.Tabulator, pagination='remote',page_size=10,sizing_mode='stretch_width')
co2_table


# ### CO2 vs GDP scatterplot

# In[18]:


co2_vs_gdp_scatterplot_pipeline= (
    idf[
        (idf.year==year_slider) & 
        (~ (idf.country.isin(continents)))
    ]
    .groupby(['country','year','gdp_per_capita'])['co2'].mean()
    .to_frame()
    .reset_index()
    .sort_values(by='year')
    .reset_index(drop=True)
) 


# In[19]:


co2_vs_gdp_scatterplot_pipeline


# In[20]:


co2_vs_gdp_scatterplot=co2_vs_gdp_scatterplot_pipeline.hvplot(x='gdp_per_capita',
                                                              y='co2',
                                                              by='country',
                                                              size=80,
                                                              kind='scatter',
                                                             alpha=0.7,
                                                             legend=False,
                                                             height=500,
                                                             width=500)
co2_vs_gdp_scatterplot


# ### Bar chart with CO2 sources by continent 

# In[21]:


yaxis_co2_source = pn.widgets.RadioButtonGroup(
    name='Y axis', 
    options=['coal_co2', 'oil_co2', 'gas_co2'], 
    button_type='success'
)

continents_excl_world = ['Asia', 'Oceania', 'Europe', 'Africa', 'North America', 'South America', 'Antarctica']

co2_source_bar_pipeline = (
    idf[
        (idf.year == year_slider) &
        (idf.country.isin(continents_excl_world))
    ]
    .groupby(['year', 'country'])[yaxis_co2_source].sum()
    .to_frame()
    .reset_index()
    .sort_values(by='year')  
    .reset_index(drop=True)
)


# In[22]:


co2_source_bar_plot = co2_source_bar_pipeline.hvplot(kind='bar', 
                                                     x='country', 
                                                     y=yaxis_co2_source, 
                                                     title='CO2 source by continent')
co2_source_bar_plot


# ### Creating the Dashboard

# Layout using Template

# Panel [Templates](https://panel.holoviz.org/user_guide/Templates.html)

# In[23]:


template = pn.template.FastListTemplate(
    title='World CO2 emission dashboard', 
    sidebar=[pn.pane.Markdown("# CO2 Emissions and Climate Change"), 
             pn.pane.Markdown("#### Carbon dioxide emissions are the primary driver of global climate change. It’s widely recognised that to avoid the worst impacts of climate change, the world needs to urgently reduce emissions. But, how this responsibility is shared between regions, countries, and individuals has been an endless point of contention in international discussions."), 
             pn.pane.PNG('https://cdn.pixabay.com/photo/2016/04/24/04/53/globe-1348777_960_720.png', sizing_mode='scale_both'),
             pn.pane.Markdown("## Settings"),   
             year_slider],
    main=[pn.Row(pn.Column(yaxis_co2, 
                           co2_plot.panel(width=700), margin=(0,25)), 
                 co2_table.panel(width=500)), 
          pn.Row(pn.Column(co2_vs_gdp_scatterplot.panel(width=600), margin=(0,25)), 
                 pn.Column(yaxis_co2_source, co2_source_bar_plot.panel(width=600)))],
    accent_base_color="#88d8b0",
    header_background="#88d8b0",
)
template.servable();


# After running all the cells above 
# 
# Close jupyter notebook and anaconda prompt (it also works with it opened)
# 
# 1. Open another anaconda prompt 
# 
# 2. Change the directory (using 'cd') to the same place where the .ipynb is located 
# 
# 3. Type 
# 
# panel serve CO2emissionbycontinent.ipynb 
# 
# The exact name of the .ipynb dashboard (without the quotes) 
# 
# 4. Copy the link that will be generated and paste it in the browser
# 
# 
# Wouldn't it be nice if it could be sharable with anyone?
# To do that a good option could be to publish on github

# To publish on a github page:
# 
# to install panel on conda 
# 
# 1. conda install panel hvplot -c pyviz
# 
# to check if the version is at least 14.0
# 
# 2. conda list panel 
# 
# to convert the py to js and html (do not need "docs/app" it does not have to go into a folder) 
# 
# 3. panel convert app.py --to pyodide-worker --out docs/app
# 
# 
# 4. Then upload it on github [see this](https://towardsdatascience.com/how-to-deploy-a-panel-visualization-dashboard-to-github-pages-2f520fd8660)
# 
# on github pages build and deploy it can go into the main root with no problem, or docs if you want  
# there is the need of an index.html file (you can copy the html file generated and rename it index.html), sometimes all files together works sometimes it only shows the readme file 
# it takes 1-3 minutes to deploy so be patient
# 
# See the pages below if you want

# I consulted this [page](https://github.com/thu-vu92/python-dashboard-panel)
# 
# And this as [well](https://towardsdatascience.com/how-to-deploy-a-panel-visualization-dashboard-to-github-pages-2f520fd8660)
# 
# And after publishing I had problem loading the page and got the error: ValueError: PNG pane cannot parse string that is not a filename or URL
# 
# For that this page [helped](https://panel.holoviz.org/_modules/panel/pane/image.html) 
# 
# So did [this](https://panel.holoviz.org/reference/panes/PNG.html)

# In[ ]:






await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()