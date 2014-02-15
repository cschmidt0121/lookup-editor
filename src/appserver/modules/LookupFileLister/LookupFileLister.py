import logging
import controllers.module as module
import cherrypy
import splunk.entity as en
import json
import traceback
import sys
import os
from splunk.appserver.mrsparkle.lib.util import make_splunkhome_path

class LookupFileLister(module.ModuleHandler):

    def generateResults(self, **args):
        
        # Prepare a response
        response = {}
        
        try:
            
            # Do something here...
            response["message"] = "No operation performed; this is a placeholder"
            response["success"] = False

        except Exception, e :
            
            tb = traceback.format_exc()
            
            response["message"] = str(e)
            response["trace"] = tb
            response["success"] = False

        # Return 
        return json.dumps(response)