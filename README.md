# Ski routing demo

[Link to demo](https://laurencewilkes.github.io/SkiRouting/)

This project is a small scale demo of a routing application for ski resorts.
Currently, the demo focusses on the Evasion Mont Blanc ski area which is a group of 6 partially interconnected resorts in the French alps.
The aim is to visualise pistes and ski lifts on an interactive map in a manner inspired by the [OpenSkiMap](https://openskimap.org/), and ultimately allow users to compute the most efficient path across a resort/ski area taking into account the difficulty of the runs, the length and elevation change of runs, the time the lift takes, and maybe even lift waiting times.

The current prototype uses [Leaflet](https://leafletjs.com/) for the map display, with [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles. 
A query is made to [Overpass](https://overpass-api.de/) for the piste and ski lift ways, and elevation data is sourced from [open-elevation](https://open-elevation.com/).
The elevation data is used to infer piste directions and to display detailed height information.

---

## To do
- *Actually introduce routing* 
    - Produce a graph representation of the resort bearing in mind that the nodes included in the ski piste ways are not necessarily complete/connected.
    - Choose an appropriate search algorithm and decide what data should be stored.
    - Decide what metrics to take into account.
    - UI and controls. I.e. avoid black runs.
- *Update how the data is stored/sourced* 
    - Currently, only the bounding boxes of the resorts are stored locally. This was done so that implementing other resorts shouldn't be too difficult. 
    - However, the external APIs should most likely not be relied on too heavily. For just a few resorts, it would make sense to store the data in the repo and update on a daily/weekly basis. 
- *Include more resorts* 
    - This should most likely be done at least partially on a case-by-case basis as producing an accurate graph for each resort may be difficult to automate.
- *Optimise for mobile use*
    - The app will most likely be used on mobile, ways should be larger and have a larger clickable area.
    - Include a location dot and the ability to centre in on the users location.


