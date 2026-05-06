# CONTROLLER MAPPING 

Controllers are mapped to CC numbers using a univoque string as key and are configured by the admin in the controller mapping section of the AdminPanel.vue. 


Each controller can be configured with:
- cc number
- label 
- min value (0-127)
- max value (0-127)
- type of controller (h-slider,v-slider,switch,multi)
- controller category (select from categories_config list)
- order (define the order of the controller in the relative category, we can use a drag and drop to reorder)

This data are used to create the gui controls.
Type of controllers UI
h-slider = a vertical slider with min/max values setted in the configuration
v-slider = a horizontal slider with min/max values setted in the configuration
switch = a switch with two states (0-1 or on/off but value is 0-127)
multi = a multi-state switch with a list of values setted in the configuration, is like to set a dropdown menu where each item has:
a label and a value. so you can have a list of items like: 
- Ambience = 0
- Hall = 23
label and values are set by the admin.
to ad items use a OPTION +
The multi controller has to be rendered as radio buttons in horizontal way.

