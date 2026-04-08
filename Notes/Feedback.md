Mihkel:
1)
Price pills should show up regardless of the zoom level. Maybe there can be a button that the user can toggle to show pill style buttons with prices and just dots. Or when zoomed out the cheapest prices are shown and as we zoom in more and more other pill style prices are revealed.

2)
Think of this use case that when someone driving somewhere and fuel gets low. And now they remember that they have this app. While driving you really don't have the time to start manually searching for all the different prices and compare them. That includes zooming in and out and whatnot. So the first thing the app should do after it's opened - show me the cheapest fuel price at a gas station near me. Maybe the cheapest for all the different fuel types. So 4 different gas stations - cheapest 95, cheapest 98, cheapest diesel etc. I'm not shure how to define the "near me" but maybe have a defining radius or the 3-5 nearest stations regardless the radius? Maybe users who are logged in can specify specific brands that they prefer (like circle K or olerex) for these kinds of notifications. And maybe an option to navigate to that gas station or initiate the navigation with the default navigation app on the phone. 
All of this shouldn't be just a mode but the core way this app works. Accessing the cheapest fuel near by and a way to get there is the thing that should be easily accessible all the time. 

3)
For the ability to update the price - there should be a camera button somewhere on the main view just like the center GPS button is. When pressed the user has the ability to snap a photo of the gas station totem and then it should automatically select the station to apply the prices based on GPS proximity and the context of the photo. So the ai should ideally identify which gas station the totem belons to and then make a decision to select the correct station if there are more then one in the near proximity. Or the user snaps a photo and the app gives you a list of different gas stations that are in proximity and are logical to add to. So then the user can select which gas station the snapped photo applies to. Or if the AI is confused about which gas station the picture applies to then ask to confirm. Something like that.  

4)
There should be a way to define a radius around the user GPS position - 5km, 10 km or maybe have a field where this number can be inserted by the user.
Mihkel thought that this should maybe be like a notification zone or something that notifies when prices drop relativre to their previous price. Maybe a way to have the app notify without even needing to open the app. Not sure how notifications are handled with webaps. Maybe when we have a fully functional app at some point.  

Mikk:
1)
Sometimes the gemini servers are too busy to make the image price recognition complete the request. So either having the app retry the image recognition with the image taken or leave the photo up on the screen so the user can manually update the prices. Currently in case of an error everything is lost.
The error I get is " AI lugemine ebaõnnestus: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generatecontent: [503 service unavailable] this model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. 

2)
Name of the app: Kyts