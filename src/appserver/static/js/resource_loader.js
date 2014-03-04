function addStylesheet( filename ){
	
	filename = Splunk.util.make_url(filename);
	
    // For Internet Explorer, use createStyleSheet since adding a stylesheet using a link tag will not be recognized
    // (http://stackoverflow.com/questions/1184950/dynamically-loading-css-stylesheet-doesnt-work-on-ie)
    if( document.createStyleSheet ){
        document.createStyleSheet(filename);
    }
    // For everyone else
    else{
        var link = $("<link>");
        link.attr({type: 'text/css',rel: 'stylesheet', href: filename});
        $("head").append( link );
    }
}

function addJavascript( filename ){
    var script = $("<script>");
    script.attr({type: 'text/javascript', src: filename});
    $("head").append( script );
}